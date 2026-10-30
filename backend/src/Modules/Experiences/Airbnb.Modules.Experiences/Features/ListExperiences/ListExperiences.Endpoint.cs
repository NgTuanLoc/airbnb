using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Experiences;

internal static partial class ListExperiences
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/experiences", async ([AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(query, cancellationToken)));
}
