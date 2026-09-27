namespace Airbnb.Modules.Experiences.Contracts;

// Adds a submitted review to an experience's rating and review count. Calling it again with the same review id changes nothing.
public interface IExperienceReviewStats
{
    Task ApplyReviewAsync(string reviewId, string experienceId, int rating, CancellationToken cancellationToken);
}
