namespace Airbnb.Modules.Identity.External;

internal static partial class StartExternalLogin
{
    // FlowId goes into the browser's httpOnly flow cookie and comes back with the callback; only its hash is stored.
    internal sealed record StartDto(string AuthorizationUrl, string FlowId, string Provider, DateTimeOffset ExpiresAt);
}
