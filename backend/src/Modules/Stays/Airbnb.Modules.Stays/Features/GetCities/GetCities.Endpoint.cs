using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Stays.Cities;

internal static partial class GetCities
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/cities", async (Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(cancellationToken)));
}
