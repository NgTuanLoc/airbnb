using System.Security.Claims;
using Airbnb.Modules.Bookings.Contracts;
using Airbnb.Modules.Bookings.Data;
using Airbnb.Modules.Bookings.Payments;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wolverine.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings;

internal static class CancelBooking
{
    // One retry is enough: a booking leaves pending once, so the second attempt sees it settled.
    private const int MaxAttempts = 2;

    // Only the guest cancels, and only before the check-in day; cancelling frees the nights for the exclusion constraint.
    // A pending booking's payment is voided first (so no late success can charge for it); a confirmed one's is refunded
    // by the payment service when it hears BookingCancelled.
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/bookings/{id}/cancel", async Task<Results<Ok<ApiResponse<BookingDto>>, NotFound<ApiResponse<object>>, Conflict<ApiResponse<object>>, JsonHttpResult<ApiResponse<object>>>> (
            string id, ClaimsPrincipal user, IServiceScopeFactory scopes, PaymentsClient payments, TimeProvider time, CancellationToken cancellationToken) =>
        {
            var guestId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
            for (var attempt = 1; attempt <= MaxAttempts; attempt++)
            {
                // A fresh scope per attempt: an outbox whose save lost the race still holds its unsent event.
                await using var scope = scopes.CreateAsyncScope();
                var outbox = scope.ServiceProvider.GetRequiredService<IDbContextOutbox<BookingsDbContext>>();
                if (await TryCancelAsync(outbox, id, guestId, payments, time, cancellationToken) is { } result)
                {
                    return result;
                }
            }
            return TypedResults.Conflict(ApiResponse.Fail("This booking just changed. Try again.", "booking_changed"));
        }).RequireAuthorization();

    // Null when the booking request or the reconciler settled the booking meanwhile: the caller starts over and cancels
    // what it became (a confirmed booking whose payment the void already stopped, or a declined one).
    private static async Task<Results<Ok<ApiResponse<BookingDto>>, NotFound<ApiResponse<object>>, Conflict<ApiResponse<object>>, JsonHttpResult<ApiResponse<object>>>?> TryCancelAsync(
        IDbContextOutbox<BookingsDbContext> outbox, string id, string guestId, PaymentsClient payments, TimeProvider time, CancellationToken cancellationToken)
    {
        var booking = await outbox.DbContext.Bookings.SingleOrDefaultAsync(b => b.Id == id && b.GuestId == guestId, cancellationToken);
        if (booking is null)
        {
            return TypedResults.NotFound(ApiResponse.Fail(GetBooking.NotFoundMessage));
        }
        if (booking.Status == BookingStatus.Cancelled)
        {
            return TypedResults.Ok(ApiResponse.Ok(BookingDto.From(booking)));
        }
        if (booking.Status == BookingStatus.Declined)
        {
            return TypedResults.Conflict(ApiResponse.Fail("This booking's payment was declined", "payment_declined"));
        }
        if (booking.CheckIn <= BookingDates.Today(time))
        {
            return TypedResults.Conflict(ApiResponse.Fail("This trip has already started", "trip_started"));
        }

        var wasPending = booking.Status == BookingStatus.Pending;
        if (wasPending && !await payments.VoidAsync(booking.Id, cancellationToken))
        {
            return TypedResults.Json(ApiResponse.Fail("We couldn't reach the payment service. Try again in a moment."),
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        booking.Status = BookingStatus.Cancelled;
        booking.CancelledAt = time.GetUtcNow();
        if (!wasPending)
        {
            // The cancellation and its BookingCancelled event commit together (outbox). A pending booking was never
            // announced, so its cancellation isn't either.
            await outbox.PublishAsync(new BookingCancelled(
                booking.Id, booking.ListingId, booking.ListingTitle, booking.GuestName, booking.GuestEmail,
                booking.CheckIn, booking.CheckOut, booking.CancelledAt.Value));
        }
        try
        {
            await outbox.SaveChangesAndFlushMessagesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return null;
        }
        return TypedResults.Ok(ApiResponse.Ok(BookingDto.From(booking)));
    }
}
