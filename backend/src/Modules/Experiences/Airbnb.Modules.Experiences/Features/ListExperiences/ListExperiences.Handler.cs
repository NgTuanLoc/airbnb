using System.Globalization;
using Airbnb.Modules.Experiences.Data;
using Airbnb.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Experiences;

internal static partial class ListExperiences
{
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
}
