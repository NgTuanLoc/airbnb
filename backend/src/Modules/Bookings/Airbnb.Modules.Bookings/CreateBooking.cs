using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Airbnb.Modules.Bookings.Data;
using Airbnb.Modules.Stays.Contracts;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Airbnb.Modules.Bookings;

internal static class CreateBooking
{
    // Host listings live in the frontend until roadmap phase 4 (spec §1); only they may carry a quote.
    internal const string HostListingPrefix = "hl-";
    internal const string Taken = "Those dates were just booked. Pick different dates.";

    public sealed record QuoteInput(
        [property: Required, StringLength(50, MinimumLength = 1)] string? HostId,
        [property: Range(1, 100_000)] decimal PricePerNight,
        [property: Range(1, 16)] int MaxGuests);

    public sealed record Command(
        [property: Required, StringLength(50, MinimumLength = 1)] string? ListingId,
        [property: Required, StringLength(10)] string? CheckIn,
        [property: Required, StringLength(10)] string? CheckOut,
        [property: Range(1, 16)] int Adults,
        [property: Range(0, 15)] int Children,
        QuoteInput? Quote);

    internal sealed class Handler(BookingsDbContext db, IListingLookup listings, TimeProvider time)
    {
        // Two inserts racing on the same nights either hit the exclusion constraint or deadlock on it; Npgsql
        // reports the deadlock victim wrapped (InvalidOperationException > DbUpdateException > PostgresException).
        private static bool IsOverlap(Exception exception)
        {
            for (var e = exception; e is not null; e = e.InnerException)
            {
                if (e is PostgresException { SqlState: PostgresErrorCodes.ExclusionViolation or PostgresErrorCodes.DeadlockDetected })
                {
                    return true;
                }
            }
            return false;
        }

        public async Task<Results<Created<ApiResponse<BookingDto>>, BadRequest<ApiResponse<object>>, NotFound<ApiResponse<object>>, Conflict<ApiResponse<object>>>> HandleAsync(
            Command command, ClaimsPrincipal user, CancellationToken cancellationToken)
        {
            var dates = BookingDates.Parse(command.CheckIn!, command.CheckOut!, BookingDates.Today(time), out var dateError);
            if (dates is not { } stay)
            {
                return TypedResults.BadRequest(ApiResponse.Fail(dateError!));
            }

            ListingBookingInfo? info;
            if (command.ListingId!.StartsWith(HostListingPrefix, StringComparison.Ordinal))
            {
                if (command.Quote is not { } quote)
                {
                    return TypedResults.BadRequest(ApiResponse.Fail("A quote is required for host listings"));
                }
                info = new ListingBookingInfo(quote.HostId!, quote.PricePerNight, quote.MaxGuests);
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
                CheckIn = stay.CheckIn,
                CheckOut = stay.CheckOut,
                Adults = command.Adults,
                Children = command.Children,
                NightlyPrice = info.PricePerNight,
                Nights = nights,
                CleaningFee = price.CleaningFee,
                ServiceFee = price.ServiceFee,
                Total = price.Total,
                Status = BookingStatus.Confirmed,
                CreatedAt = time.GetUtcNow(),
            };
            db.Bookings.Add(booking);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (Exception exception) when (IsOverlap(exception))
            {
                // The database refuses overlapping confirmed stays, however many guests confirm at once (spec §1).
                return TypedResults.Conflict(ApiResponse.Fail(Taken));
            }

            return TypedResults.Created($"/api/bookings/{booking.Id}", ApiResponse.Ok(BookingDto.From(booking)));
        }
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/bookings", (Command command, ClaimsPrincipal user, Handler handler, CancellationToken cancellationToken) =>
                handler.HandleAsync(command, user, cancellationToken))
            .RequireAuthorization();
}
