using System.ComponentModel.DataAnnotations;

namespace Airbnb.Modules.Hosts;

internal static partial class GetHost
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query([property: StringLength(50, MinimumLength = 1)] string Id);
}
