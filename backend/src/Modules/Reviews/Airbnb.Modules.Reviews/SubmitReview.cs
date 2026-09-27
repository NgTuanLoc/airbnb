using System.ComponentModel.DataAnnotations;
using Airbnb.Modules.Experiences.Contracts;
using Airbnb.Modules.Reviews.Contracts;
using Airbnb.Modules.Reviews.Data;
using Airbnb.Modules.Stays.Contracts;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Caching.Hybrid;
using Wolverine.EntityFrameworkCore;

namespace Airbnb.Modules.Reviews;

internal static class SubmitReview
{
    // On images.unsplash.com, which next.config.ts allows; callers can't choose an avatar (spec §3).
    internal const string DefaultAvatar = "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&q=80";

    // public for the validation generator; still invisible outside the assembly because the class is internal.
    // Strings are nullable so a missing field reaches validation and gets a field-level message.
    public sealed record Command(
        [property: Required, AllowedValues("stay", "experience", ErrorMessage = "The SubjectType field must be 'stay' or 'experience'.")]
        string? SubjectType,
        [property: Required, StringLength(50, MinimumLength = 1)] string? SubjectId,
        [property: Required, StringLength(60, MinimumLength = 1)] string? AuthorName,
        [property: Range(1, 5)] int Rating,
        [property: Required, StringLength(1000, MinimumLength = 1)] string? Body);

    internal sealed class Handler(
        IDbContextOutbox<ReviewsDbContext> outbox,
        IListingLookup listings,
        IExperienceLookup experiences,
        TimeProvider time,
        HybridCache cache)
    {
        // Returns null when the subject doesn't exist.
        public async Task<ReviewDto?> HandleAsync(Command command, CancellationToken cancellationToken)
        {
            var subjectType = command.SubjectType == "stay" ? ReviewSubjectType.Stay : ReviewSubjectType.Experience;
            var exists = subjectType == ReviewSubjectType.Stay
                ? await listings.ExistsAsync(command.SubjectId!, cancellationToken)
                : await experiences.ExistsAsync(command.SubjectId!, cancellationToken);
            if (!exists)
            {
                return null;
            }

            var review = new Review
            {
                Id = Guid.CreateVersion7().ToString(),
                SubjectType = command.SubjectType!,
                SubjectId = command.SubjectId!,
                AuthorName = command.AuthorName!.Trim(),
                AuthorAvatar = DefaultAvatar,
                Rating = command.Rating,
                Body = command.Body!.Trim(),
                CreatedAt = time.GetUtcNow(),
            };

            outbox.DbContext.Reviews.Add(review);
            await outbox.PublishAsync(new ReviewSubmitted(review.Id, subjectType, review.SubjectId, review.Rating, review.CreatedAt));
            // One Postgres transaction for the review row and the outgoing event, then the event is relayed.
            await outbox.SaveChangesAndFlushMessagesAsync(cancellationToken);
            // After the commit, so a concurrent read can't re-cache the list without the new review.
            await cache.RemoveByTagAsync(ReviewsModule.CacheTag, cancellationToken);

            return new ReviewDto(
                review.Id, review.SubjectType, review.SubjectId, review.AuthorName, review.AuthorAvatar, review.Rating, review.Body, review.CreatedAt);
        }
    }

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/reviews", async Task<Results<Created<ApiResponse<ReviewDto>>, NotFound<ApiResponse<object>>>> (
            Command command, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(command, cancellationToken) is { } review
                ? TypedResults.Created((string?)null, ApiResponse.Ok(review))
                : TypedResults.NotFound(ApiResponse.Fail(
                    $"{(command.SubjectType == "stay" ? "Listing" : "Experience")} '{command.SubjectId}' was not found")));
}
