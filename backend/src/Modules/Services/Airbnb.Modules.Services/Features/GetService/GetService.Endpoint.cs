using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Services;

internal static partial class GetService
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/services/{id}", async Task<Results<Ok<ApiResponse<ServiceDto>>, NotFound<ApiResponse<object>>>> (
            [AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(query, cancellationToken) is { } service
                ? TypedResults.Ok(ApiResponse.Ok(service))
                : TypedResults.NotFound(ApiResponse.Fail($"Service '{query.Id}' was not found")));
}
