using Airbnb.Modules.Bookings.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings;

internal static class GetAvailability
{
    // Public and uncached: the calendar must see a stay the moment it's booked (spec §1).
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/bookings/availability", async (string listingId, BookingsDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        {
            var today = BookingDates.Today(time);
            var stays = await db.Bookings
                .AsNoTracking()
                .Where(b => b.ListingId == listingId && b.Status == BookingStatus.Confirmed && b.CheckOut > today)
                .OrderBy(b => b.CheckIn)
                .Select(b => new StayDto(b.CheckIn, b.CheckOut))
                .ToListAsync(cancellationToken);
            return TypedResults.Ok(ApiResponse.Ok(stays));
        });
}
