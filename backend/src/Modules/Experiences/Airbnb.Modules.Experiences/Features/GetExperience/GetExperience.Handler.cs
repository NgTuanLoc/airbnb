using Airbnb.Modules.Experiences.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Experiences;

internal static partial class GetExperience
{
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
}
