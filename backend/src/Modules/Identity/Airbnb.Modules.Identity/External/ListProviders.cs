using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Identity.External;

internal static class ListProviders
{
    internal sealed record ProviderDto(string Id, string Name);

    // SSO connections aren't listed: which companies use them is nobody's business. The form finds one by email.
    internal sealed record ProvidersDto(IReadOnlyList<ProviderDto> Social, bool Sso);

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/auth/providers", (ExternalProviders providers) => TypedResults.Ok(ApiResponse.Ok(new ProvidersDto(
            providers.Social.Select(provider => new ProviderDto(provider.Key, provider.Name)).ToList(),
            providers.HasSso))));
}
