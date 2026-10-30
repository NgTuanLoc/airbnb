using System.ComponentModel.DataAnnotations;

namespace Airbnb.Modules.Identity.External;

internal static partial class StartExternalLogin
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    // Provider "sso" finds the connection by Email's domain; Link starts a "connect" flow for the signed-in user.
    public sealed record Command(
        [property: Required, StringLength(64, MinimumLength = 1)] string? Provider,
        [property: EmailAddress, StringLength(254)] string? Email,
        bool Link);
}
