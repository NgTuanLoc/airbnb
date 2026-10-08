using System.Security.Claims;
using Airbnb.Modules.Bookings.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings;

internal static class CancelBooking
{
    // Only the guest cancels, and only before the check-in day; cancelling frees the nights for the exclusion constraint.
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/bookings/{id}/cancel", async Task<Results<Ok<ApiResponse<BookingDto>>, NotFound<ApiResponse<object>>, Conflict<ApiResponse<object>>>> (
            string id, ClaimsPrincipal user, BookingsDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        {
            var guestId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var booking = await db.Bookings.SingleOrDefaultAsync(b => b.Id == id && b.GuestId == guestId, cancellationToken);
            if (booking is null)
            {
                return TypedResults.NotFound(ApiResponse.Fail(GetBooking.NotFoundMessage));
            }
            if (booking.Status == BookingStatus.Cancelled)
            {
                return TypedResults.Ok(ApiResponse.Ok(BookingDto.From(booking)));
            }
            if (booking.CheckIn <= BookingDates.Today(time))
            {
                return TypedResults.Conflict(ApiResponse.Fail("This trip has already started"));
            }

            booking.Status = BookingStatus.Cancelled;
            booking.CancelledAt = time.GetUtcNow();
            await db.SaveChangesAsync(cancellationToken);
            return TypedResults.Ok(ApiResponse.Ok(BookingDto.From(booking)));
        }).RequireAuthorization();
}
