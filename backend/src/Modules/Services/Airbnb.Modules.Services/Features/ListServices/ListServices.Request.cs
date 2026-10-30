using System.ComponentModel.DataAnnotations;
using Airbnb.SharedKernel;

namespace Airbnb.Modules.Services;

internal static partial class ListServices
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query(
        [property: StringLength(50)] string? Category,
        [property: Range(1, Paging.MaxPage)] int Page = Paging.DefaultPage,
        [property: Range(1, Paging.MaxLimit)] int Limit = Paging.DefaultLimit);
}
