using System.ComponentModel.DataAnnotations;

namespace Airbnb.Modules.Identity.External;

internal static partial class CompleteExternalLogin
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    // Provider is the one in the callback URL; FlowId comes from the browser's flow cookie; the rest from the provider.
    public sealed record Command(
        [property: Required, StringLength(64, MinimumLength = 1)] string? Provider,
        [property: Required, StringLength(64, MinimumLength = 1)] string? FlowId,
        [property: Required, StringLength(512, MinimumLength = 1)] string? State,
        [property: Required, StringLength(4096, MinimumLength = 1)] string? Code,
        [property: StringLength(2048)] string? Iss);
}
