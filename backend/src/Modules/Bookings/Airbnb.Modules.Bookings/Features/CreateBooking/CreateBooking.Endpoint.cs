using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Mvc;

namespace Airbnb.Modules.Bookings;

internal static partial class CreateBooking
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/bookings", (Command command, ClaimsPrincipal user, Handler handler, [FromHeader(Name = QuoteKeyHeader)] string? quoteKey, CancellationToken cancellationToken) =>
                handler.HandleAsync(command, user, quoteKey, cancellationToken))
            .RequireAuthorization();
}
