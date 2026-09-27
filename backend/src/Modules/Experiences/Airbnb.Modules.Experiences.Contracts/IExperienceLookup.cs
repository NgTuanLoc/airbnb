namespace Airbnb.Modules.Experiences.Contracts;

// Lets other modules check that an experience exists without depending on the Experiences module (spec §1).
public interface IExperienceLookup
{
    Task<bool> ExistsAsync(string experienceId, CancellationToken cancellationToken);
}
