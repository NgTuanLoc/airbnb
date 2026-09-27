namespace Airbnb.Modules.Reviews.Contracts;

// Published once a review is stored; Stays and Experiences consume it to update their own rating copies (spec §3).
public sealed record ReviewSubmitted(string ReviewId, ReviewSubjectType SubjectType, string SubjectId, int Rating, DateTimeOffset OccurredAt);
