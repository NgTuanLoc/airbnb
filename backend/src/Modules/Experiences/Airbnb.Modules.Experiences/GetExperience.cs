using System.ComponentModel.DataAnnotations;
using Airbnb.Modules.Experiences.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Experiences;

internal static class GetExperience
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query([property: StringLength(50, MinimumLength = 1)] string Id);

    internal sealed class Handler(ExperiencesDbContext db, HybridCache cache)
    {
        public ValueTask<ExperienceDto?> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                $"experiences:experience:{query.Id}",
                async token => await db.Experiences.AsNoTracking()
                    .Where(e => e.Id == query.Id)
                    .Select(ExperienceDto.Projection)
                    .FirstOrDefaultAsync(token),
                tags: [ExperiencesModule.CacheTag],
                cancellationToken: cancellationToken);
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/experiences/{id}", async Task<Results<Ok<ApiResponse<ExperienceDto>>, NotFound<ApiResponse<object>>>> (
            [AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(query, cancellationToken) is { } experience
                ? TypedResults.Ok(ApiResponse.Ok(experience))
                : TypedResults.NotFound(ApiResponse.Fail($"Experience '{query.Id}' was not found")));
}
