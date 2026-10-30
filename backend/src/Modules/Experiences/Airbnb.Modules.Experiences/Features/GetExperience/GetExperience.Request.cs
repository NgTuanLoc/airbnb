using System.ComponentModel.DataAnnotations;

namespace Airbnb.Modules.Experiences;

internal static partial class GetExperience
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query([property: StringLength(50, MinimumLength = 1)] string Id);
}
