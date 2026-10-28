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
using Wolverine.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings;

internal static class CancelBooking
{
    // Only the guest cancels, and only before the check-in day; cancelling frees the nights for the exclusion constraint.
    // A pending booking's payment is voided first (so no late success can charge for it); a confirmed one's is refunded
    // by the payment service when it hears BookingCancelled.
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/bookings/{id}/cancel", async Task<Results<Ok<ApiResponse<BookingDto>>, NotFound<ApiResponse<object>>, Conflict<ApiResponse<object>>, JsonHttpResult<ApiResponse<object>>>> (
            string id, ClaimsPrincipal user, IDbContextOutbox<BookingsDbContext> outbox, PaymentsClient payments, TimeProvider time, CancellationToken cancellationToken) =>
        {
            var guestId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
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
                return TypedResults.Conflict(ApiResponse.Fail("This booking's payment was declined"));
            }
            if (booking.CheckIn <= BookingDates.Today(time))
            {
                return TypedResults.Conflict(ApiResponse.Fail("This trip has already started"));
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
                // The reconciler settled it meanwhile; the guest sees the new state and can cancel again.
                return TypedResults.Conflict(ApiResponse.Fail("This booking just changed. Try again."));
            }
            return TypedResults.Ok(ApiResponse.Ok(BookingDto.From(booking)));
        }).RequireAuthorization();
}
