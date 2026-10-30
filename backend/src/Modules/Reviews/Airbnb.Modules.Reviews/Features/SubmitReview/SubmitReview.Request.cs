using System.ComponentModel.DataAnnotations;

namespace Airbnb.Modules.Reviews;

internal static partial class SubmitReview
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    // Strings are nullable so a missing field reaches validation and gets a field-level message.
    public sealed record Command(
        [property: Required, AllowedValues("stay", "experience", ErrorMessage = "The SubjectType field must be 'stay' or 'experience'.")]
        string? SubjectType,
        [property: Required, StringLength(50, MinimumLength = 1)] string? SubjectId,
        [property: Required, StringLength(60, MinimumLength = 1)] string? AuthorName,
        [property: Range(1, 5)] int Rating,
        [property: Required, StringLength(1000, MinimumLength = 1)] string? Body);
}
