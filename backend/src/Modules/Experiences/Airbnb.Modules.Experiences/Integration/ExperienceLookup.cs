using Airbnb.Modules.Experiences.Contracts;
using Airbnb.Modules.Experiences.Data;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Experiences;

internal sealed class ExperienceLookup(ExperiencesDbContext db) : IExperienceLookup
{
    public Task<bool> ExistsAsync(string experienceId, CancellationToken cancellationToken) =>
        db.Experiences.AnyAsync(e => e.Id == experienceId, cancellationToken);
}
