using System.ComponentModel.DataAnnotations;
using System.Globalization;
using Airbnb.Modules.Experiences.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Experiences;

internal static class ListExperiences
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query(
        [property: StringLength(50)] string? Category,
        [property: Range(1, Paging.MaxPage)] int Page = Paging.DefaultPage,
        [property: Range(1, Paging.MaxLimit)] int Limit = Paging.DefaultLimit);

    internal sealed class Handler(ExperiencesDbContext db, HybridCache cache)
    {
        public ValueTask<ApiResponse<IReadOnlyList<ExperienceDto>>> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                string.Create(CultureInfo.InvariantCulture, $"experiences:list:{query.Category}|{query.Page}|{query.Limit}"),
                async token => await db.Experiences.AsNoTracking()
                    .Where(e => string.IsNullOrWhiteSpace(query.Category) || e.Category == query.Category)
                    .OrderBy(e => e.SortOrder)
                    .Select(ExperienceDto.Projection)
                    .ToPageAsync(query.Page, query.Limit, token),
                tags: [ExperiencesModule.CacheTag],
                cancellationToken: cancellationToken);
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/experiences", async ([AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(query, cancellationToken)));
}
