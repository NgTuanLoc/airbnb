using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Stays.Listings;

internal static partial class SearchListings
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/listings", async ([AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(query, cancellationToken)));
}
