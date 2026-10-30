using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Reviews;

internal static partial class ListReviews
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/reviews", async ([AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(query, cancellationToken)));
}
