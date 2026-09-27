using Airbnb.Modules.Reviews.Contracts;
using Airbnb.Modules.Stays.Contracts;

namespace Airbnb.Api.Messaging;

// Wolverine runs only public handler types, and a module exposes nothing but its module class, so consumers live in
// the host and hand the event to the module through its Contracts interface.
public static class StaysReviewSubmittedHandler
{
    public static Task HandleAsync(ReviewSubmitted message, IListingReviewStats stats, CancellationToken cancellationToken) =>
        message.SubjectType == ReviewSubjectType.Stay
            ? stats.ApplyReviewAsync(message.ReviewId, message.SubjectId, message.Rating, cancellationToken)
            : Task.CompletedTask;
}
