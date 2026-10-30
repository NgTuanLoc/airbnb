using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Services;

internal static partial class ListServices
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/services", async ([AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(query, cancellationToken)));
}
