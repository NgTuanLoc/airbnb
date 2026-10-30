namespace Airbnb.Modules.Identity.External;

internal static partial class ListProviders
{
    internal sealed record ProviderDto(string Id, string Name);

    // SSO connections aren't listed: which companies use them is nobody's business. The form finds one by email.
    internal sealed record ProvidersDto(IReadOnlyList<ProviderDto> Social, bool Sso);
}
