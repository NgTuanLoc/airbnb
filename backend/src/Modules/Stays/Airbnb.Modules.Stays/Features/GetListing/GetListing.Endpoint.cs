using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Stays.Listings;

internal static partial class GetListing
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/listings/{id}", async Task<Results<Ok<ApiResponse<ListingDto>>, NotFound<ApiResponse<object>>>> (
            [AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(query, cancellationToken) is { } listing
                ? TypedResults.Ok(ApiResponse.Ok(listing))
                : TypedResults.NotFound(ApiResponse.Fail($"Listing '{query.Id}' was not found")));
}
