using System.Security.Claims;
using Airbnb.Modules.Bookings.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings;

internal static class GetBooking
{
    internal const string NotFoundMessage = "Booking not found";

    // Visible to its guest and its host; anyone else gets the same 404 as for a missing booking.
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/bookings/{id}", async Task<Results<Ok<ApiResponse<BookingDto>>, NotFound<ApiResponse<object>>>> (
            string id, ClaimsPrincipal user, BookingsDbContext db, CancellationToken cancellationToken) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var booking = await db.Bookings.AsNoTracking()
                .SingleOrDefaultAsync(b => b.Id == id && (b.GuestId == userId || b.HostId == userId), cancellationToken);
            return booking is null
                ? TypedResults.NotFound(ApiResponse.Fail(NotFoundMessage))
                : TypedResults.Ok(ApiResponse.Ok(BookingDto.From(booking)));
        }).RequireAuthorization();
}
