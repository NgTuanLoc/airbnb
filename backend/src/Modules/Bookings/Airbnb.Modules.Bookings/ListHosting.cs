using System.Security.Claims;
using Airbnb.Modules.Bookings.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings;

internal static class ListHosting
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/bookings/hosting", async (ClaimsPrincipal user, BookingsDbContext db, CancellationToken cancellationToken) =>
        {
            var userId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var bookings = await db.Bookings.AsNoTracking().Where(b => b.HostId == userId).OrderBy(b => b.CheckIn).ToListAsync(cancellationToken);
            return TypedResults.Ok(ApiResponse.Ok(bookings.Select(BookingDto.From).ToList()));
        }).RequireAuthorization();
}
