using Airbnb.Modules.Experiences.Contracts;
using Airbnb.Modules.Reviews.Contracts;

namespace Airbnb.Api.Messaging;

// Wolverine runs only public handler types, and a module exposes nothing but its module class, so consumers live in
// the host and hand the event to the module through its Contracts interface.
public static class ExperiencesReviewSubmittedHandler
{
    public static Task HandleAsync(ReviewSubmitted message, IExperienceReviewStats stats, CancellationToken cancellationToken) =>
        message.SubjectType == ReviewSubjectType.Experience
            ? stats.ApplyReviewAsync(message.ReviewId, message.SubjectId, message.Rating, cancellationToken)
            : Task.CompletedTask;
}
