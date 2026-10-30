using System.ComponentModel.DataAnnotations;

namespace Airbnb.Modules.Identity;

internal static partial class Login
{
    public sealed record Command(
        [property: Required, StringLength(254)] string? Email,
        [property: Required, StringLength(128)] string? Password);
}
