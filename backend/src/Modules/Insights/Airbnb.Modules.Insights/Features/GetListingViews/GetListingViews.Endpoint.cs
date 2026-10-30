using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Insights;

internal static partial class GetListingViews
{
    internal static string NotFound(string id) => $"Listing '{id}' was not found";

    // Public: guests see the counts on listing pages.
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/listings/{id}/views", async Task<Results<Ok<ApiResponse<WeeklyViews>>, NotFound<ApiResponse<object>>>> (
            string id, Handler handler, CancellationToken cancellationToken) =>
            ListingIds.IsValid(id)
                ? TypedResults.Ok(ApiResponse.Ok(await handler.HandleAsync(id, cancellationToken)))
                : TypedResults.NotFound(ApiResponse.Fail(NotFound(id))));
}
