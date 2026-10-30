using System.ComponentModel.DataAnnotations;

namespace Airbnb.Modules.Identity;

internal static partial class Register
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Command(
        [property: Required, StringLength(60, MinimumLength = 1)] string? Name,
        [property: Required, EmailAddress, StringLength(254)] string? Email,
        [property: Required, StringLength(128, MinimumLength = 8)] string? Password);
}
