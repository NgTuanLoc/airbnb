namespace Airbnb.Modules.Reviews;

internal sealed record ReviewDto(
    string Id,
    string SubjectType,
    string SubjectId,
    string AuthorName,
    string AuthorAvatar,
    int Rating,
    string Body,
    DateTimeOffset CreatedAt);
