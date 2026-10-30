using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Airbnb.Modules.Bookings.Data;
using Airbnb.Modules.Bookings.Payments;
using Airbnb.Modules.Stays.Contracts;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Npgsql;
using Wolverine.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings;

internal static partial class CreateBooking
{
    // Host listings live in the frontend until roadmap phase 4 (spec §1); only they may carry a quote.
    internal const string HostListingPrefix = "hl-";
    internal const string QuoteKeyHeader = "X-Quote-Key";
    internal const string Taken = "Those dates were just booked. Pick different dates.";

    internal const string InvalidCard = "Check your card details";

    // The payment service's decline reasons, as the guest reads them; anything else reads as a plain decline.
    private static (string Code, string Message) Decline(string? reason) => reason switch
    {
        "insufficient_funds" => ("insufficient_funds", "Your card has insufficient funds"),
        _ => ("card_declined", "Your card was declined"),
    };

    // A saga without a shared transaction: the booking is saved pending (holding the nights), then charged; the outcome
    // confirms it (with its BookingConfirmed event, through the outbox), declines it, or leaves it pending for the
    // PaymentReconciler when the payment service doesn't answer.
    internal sealed class Handler(
        IDbContextOutbox<BookingsDbContext> outbox, IListingLookup listings, PaymentsClient payments, TimeProvider time, IConfiguration configuration)
    {
        private const int MaxInsertAttempts = 3;

        // Npgsql's default strategy wraps transient errors (InvalidOperationException > DbUpdateException > PostgresException).
        private static PostgresException? Postgres(Exception exception)
        {
            for (var e = exception; e is not null; e = e.InnerException)
            {
                if (e is PostgresException postgres)
                {
                    return postgres;
                }
            }
            return null;
        }

        // Only the exclusion constraint proves the nights are taken.
        private static bool IsOverlap(Exception exception) =>
            Postgres(exception) is { SqlState: PostgresErrorCodes.ExclusionViolation, ConstraintName: BookingsDbContext.NoOverlapConstraint };

        // A deadlock only says two racing inserts collided; with chained ranges the nights may still be free, so retry.
        private static bool IsDeadlock(Exception exception) =>
            Postgres(exception) is { SqlState: PostgresErrorCodes.DeadlockDetected };

        // Only the Next server, which knows the listing, may vouch for a quote. No configured key refuses every quote.
        private bool IsTrusted(string? presentedKey)
        {
            var expected = configuration["Bookings:QuoteKey"];
            if (string.IsNullOrEmpty(expected) || string.IsNullOrEmpty(presentedKey))
            {
                return false;
            }
            return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(presentedKey));
        }

        public async Task<Results<Created<ApiResponse<BookingDto>>, Accepted<ApiResponse<BookingDto>>, BadRequest<ApiResponse<object>>, NotFound<ApiResponse<object>>, Conflict<ApiResponse<object>>, JsonHttpResult<ApiResponse<object>>>> HandleAsync(
            Command command, ClaimsPrincipal user, string? quoteKey, CancellationToken cancellationToken)
        {
            var dates = BookingDates.Parse(command.CheckIn!, command.CheckOut!, BookingDates.Today(time), out var dateError);
            if (dates is not { } stay)
            {
                return TypedResults.BadRequest(ApiResponse.Fail(dateError!));
            }

            ListingBookingInfo? info;
            if (command.ListingId!.StartsWith(HostListingPrefix, StringComparison.Ordinal))
            {
                if (command.Quote is not { } quote || !IsTrusted(quoteKey))
                {
                    return TypedResults.BadRequest(ApiResponse.Fail("A quote is required for host listings"));
                }
                info = new ListingBookingInfo(quote.HostId!, quote.PricePerNight, quote.MaxGuests, quote.Title ?? "");
            }
            else
            {
                info = await listings.FindForBookingAsync(command.ListingId, cancellationToken);
                if (info is null)
                {
                    return TypedResults.NotFound(ApiResponse.Fail($"Listing '{command.ListingId}' was not found"));
                }
            }

            if (command.Adults + command.Children > info.MaxGuests)
            {
                return TypedResults.BadRequest(ApiResponse.Fail($"This place allows at most {info.MaxGuests} guests"));
            }
            var guestId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
            if (info.HostId == guestId)
            {
                return TypedResults.BadRequest(ApiResponse.Fail("You can't book your own listing"));
            }
            if (command.Card is not { } card)
            {
                return TypedResults.BadRequest(ApiResponse.Fail(InvalidCard, "invalid_card"));
            }

            var nights = stay.CheckOut.DayNumber - stay.CheckIn.DayNumber;
            var price = BookingPricing.Calculate(info.PricePerNight, nights);
            var booking = new Booking
            {
                Id = "bk_" + Guid.CreateVersion7().ToString("N"),
                ListingId = command.ListingId,
                HostId = info.HostId,
                GuestId = guestId,
                GuestName = user.FindFirstValue(ClaimTypes.Name)!,
                GuestEmail = user.FindFirstValue(ClaimTypes.Email)!,
                ListingTitle = info.Title,
                CheckIn = stay.CheckIn,
                CheckOut = stay.CheckOut,
                Adults = command.Adults,
                Children = command.Children,
                NightlyPrice = info.PricePerNight,
                Nights = nights,
                CleaningFee = price.CleaningFee,
                ServiceFee = price.ServiceFee,
                Total = price.Total,
                Status = BookingStatus.Pending,
                CreatedAt = time.GetUtcNow(),
            };
            outbox.DbContext.Bookings.Add(booking);
            for (var attempt = 1; ; attempt++)
            {
                try
                {
                    // A failed statement rolls back and leaves the entity Added, so calling again re-inserts it.
                    await outbox.DbContext.SaveChangesAsync(cancellationToken);
                    break;
                }
                catch (Exception exception) when (IsOverlap(exception) || (IsDeadlock(exception) && attempt >= MaxInsertAttempts))
                {
                    // The database refuses overlapping pending or confirmed stays, however many guests book at once
                    // (spec §1), before anyone is charged. A deadlock that survives every retry is reported the same way.
                    return TypedResults.Conflict(ApiResponse.Fail(Taken));
                }
                catch (Exception exception) when (IsDeadlock(exception))
                {
                    // Retry: the other insert has finished or been rolled back by now.
                }
            }

            var charge = await payments.ChargeAsync(booking.Id, booking.Total, card, cancellationToken);
            switch (charge.Status)
            {
                case ChargeStatus.Succeeded:
                    await PaymentOutcomes.ConfirmAsync(outbox, booking, time, cancellationToken);
                    break;
                case ChargeStatus.Declined:
                    await PaymentOutcomes.DeclineAsync(outbox, booking, cancellationToken);
                    break;
                case ChargeStatus.InvalidCard:
                    // Nothing was charged and nothing is worth keeping: the guest fixes a typo and books again.
                    await outbox.DbContext.Bookings.Where(b => b.Id == booking.Id && b.Status == BookingStatus.Pending).ExecuteDeleteAsync(cancellationToken);
                    return TypedResults.BadRequest(ApiResponse.Fail(InvalidCard, "invalid_card"));
                case ChargeStatus.Unavailable:
                    // Refused before any charge: free the nights rather than hold them for a reconciler that can't settle them.
                    await outbox.DbContext.Bookings.Where(b => b.Id == booking.Id && b.Status == BookingStatus.Pending).ExecuteDeleteAsync(cancellationToken);
                    return TypedResults.Json(ApiResponse.Fail("Payments are unavailable right now. Try again later."),
                        statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            // Answered by the booking as it now is: the reconciler may have settled it first.
            var dto = ApiResponse.Ok(BookingDto.From(booking));
            if (booking.Status == BookingStatus.Declined)
            {
                var (code, message) = Decline(charge.DeclineReason);
                return TypedResults.Json(ApiResponse.Fail(message, code), statusCode: StatusCodes.Status402PaymentRequired);
            }
            return booking.Status == BookingStatus.Confirmed
                ? TypedResults.Created($"/api/bookings/{booking.Id}", dto)
                : TypedResults.Accepted($"/api/bookings/{booking.Id}", dto);
        }
    }
}
