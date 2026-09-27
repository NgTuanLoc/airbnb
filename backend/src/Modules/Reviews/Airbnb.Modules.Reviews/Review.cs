namespace Airbnb.Modules.Reviews;

internal sealed class Review
{
    public required string Id { get; init; }

    // "stay" or "experience", as on the wire; ReviewSubmitted carries it as Reviews.Contracts.ReviewSubjectType.
    public required string SubjectType { get; init; }

    public required string SubjectId { get; init; }

    public required string AuthorName { get; init; }

    public required string AuthorAvatar { get; init; }

    public int Rating { get; init; }

    public required string Body { get; init; }

    public DateTimeOffset CreatedAt { get; init; }
}
