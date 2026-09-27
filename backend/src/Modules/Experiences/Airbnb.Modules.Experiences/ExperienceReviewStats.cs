using Airbnb.Modules.Experiences.Contracts;
using Airbnb.Modules.Experiences.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Experiences;

internal sealed class ExperienceReviewStats(ExperiencesDbContext db, HybridCache cache) : IExperienceReviewStats
{
    public async Task ApplyReviewAsync(string reviewId, string experienceId, int rating, CancellationToken cancellationToken)
    {
        await ReviewStatistics.ApplyOnceAsync(
            db, ExperiencesModule.Schema, ExperiencesDbContext.ExperiencesTable, reviewId, experienceId, rating, cancellationToken);
        // After the commit, and on a redelivery too, so a read racing the update can't keep the old values cached.
        await cache.RemoveByTagAsync(ExperiencesModule.CacheTag, cancellationToken);
    }
}
