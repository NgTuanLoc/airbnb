using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.IdentityModel.Protocols;

namespace Airbnb.Modules.Identity.External;

internal static class ExternalHttp
{
    // The named HttpClient for every call to a provider; tests swap its primary handler for a fake identity provider.
    internal const string ClientName = "identity-external";

    // A network failure, timeout or 5xx means the provider is unreachable, not that the sign-in is invalid.
    internal static async Task<HttpResponseMessage> SendAsync(HttpClient client, HttpRequestMessage request, CancellationToken cancellationToken)
    {
        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(request, cancellationToken);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            throw new ExternalLoginException(ExternalLoginError.ProviderUnreachable, $"{request.Method} {Path(request)} failed", exception);
        }
        if ((int)response.StatusCode >= 500)
        {
            response.Dispose();
            throw new ExternalLoginException(ExternalLoginError.ProviderUnreachable, $"{request.Method} {Path(request)} answered {(int)response.StatusCode}");
        }
        return response;
    }

    // The JSON body, or null when it isn't JSON of that shape; callers decide what a missing body means.
    internal static async Task<T?> ReadJsonAsync<T>(HttpResponseMessage response, CancellationToken cancellationToken) where T : class
    {
        try
        {
            return await response.Content.ReadFromJsonAsync<T>(JsonSerializerOptions.Web, cancellationToken);
        }
        catch (JsonException)
        {
            return null;
        }
        catch (NotSupportedException)
        {
            return null;
        }
    }

    // Never the query: an authorization code must not reach the logs.
    private static string Path(HttpRequestMessage request) => request.RequestUri?.GetLeftPart(UriPartial.Path) ?? "?";
}

// Discovery and JWKS documents through IHttpClientFactory, so tests can intercept them and DNS changes are picked up.
internal sealed class FactoryDocumentRetriever(IHttpClientFactory clients, bool requireHttps) : IDocumentRetriever
{
    public async Task<string> GetDocumentAsync(string address, CancellationToken cancel)
    {
        if (requireHttps && !address.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"Identity provider metadata must use https: {address}");
        }
        using var client = clients.CreateClient(ExternalHttp.ClientName);
        using var response = await client.GetAsync(address, cancel);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync(cancel);
    }
}
