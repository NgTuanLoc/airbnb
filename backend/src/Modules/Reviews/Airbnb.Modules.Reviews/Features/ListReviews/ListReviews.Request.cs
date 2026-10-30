using System.ComponentModel.DataAnnotations;
using Airbnb.SharedKernel;

namespace Airbnb.Modules.Reviews;

internal static partial class ListReviews
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    // SubjectId is nullable so a missing value reaches validation and gets a field-level message.
    public sealed record Query(
        [property: Required, StringLength(50, MinimumLength = 1)] string? SubjectId,
        [property: Range(1, Paging.MaxPage)] int Page = Paging.DefaultPage,
        [property: Range(1, Paging.MaxLimit)] int Limit = Paging.DefaultLimit);
}
