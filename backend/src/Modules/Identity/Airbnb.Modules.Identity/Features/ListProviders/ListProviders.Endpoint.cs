using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Identity.External;

internal static partial class ListProviders
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/auth/providers", (ExternalProviders providers) => TypedResults.Ok(ApiResponse.Ok(new ProvidersDto(
            providers.Social.Select(provider => new ProviderDto(provider.Key, provider.Name)).ToList(),
            providers.HasSso))));
}
