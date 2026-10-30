using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Experiences;

internal static partial class GetExperience
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/experiences/{id}", async Task<Results<Ok<ApiResponse<ExperienceDto>>, NotFound<ApiResponse<object>>>> (
            [AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(query, cancellationToken) is { } experience
                ? TypedResults.Ok(ApiResponse.Ok(experience))
                : TypedResults.NotFound(ApiResponse.Fail($"Experience '{query.Id}' was not found")));
}
