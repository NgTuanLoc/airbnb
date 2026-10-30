using System.Text.Json.Serialization;

namespace Airbnb.Modules.Identity.External;

internal static partial class CompleteExternalLogin
{
    internal sealed record LinkedDto(string Provider, string Email);

    // A sign-in answers with a session, a connect flow with what was connected.
    internal sealed record ResultDto(
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] AuthSessionDto? Session,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] LinkedDto? Linked);
}
