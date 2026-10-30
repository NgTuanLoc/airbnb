using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Hosts;

internal static partial class GetHost
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/hosts/{id}", async Task<Results<Ok<ApiResponse<HostDto>>, NotFound<ApiResponse<object>>>> (
            [AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(query, cancellationToken) is { } host
                ? TypedResults.Ok(ApiResponse.Ok(host))
                : TypedResults.NotFound(ApiResponse.Fail($"Host '{query.Id}' was not found")));
}
