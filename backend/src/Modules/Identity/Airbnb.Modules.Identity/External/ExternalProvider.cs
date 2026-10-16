using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;

namespace Airbnb.Modules.Identity.External;

internal enum ProviderKind
{
    Social,
    Sso,
}

// What a provider needs to send the browser off; the flow row keeps the secrets behind these values.
internal sealed record AuthorizationRequest(string RedirectUri, string State, string Nonce, string CodeChallenge, string? LoginHint);

// The callback's code, with the flow's secrets that prove this server started it.
internal sealed record CodeExchange(string Code, string RedirectUri, string CodeVerifier, string Nonce, string? Issuer);

// A person as a provider vouches for them. Email is always one the provider verified, normalized.
internal sealed record ExternalIdentity(string Subject, string Email, string? Name);

internal interface IExternalProvider
{
    // "google", "github", "sso-<connection id>": in URLs, the database and the frontend.
    string Key { get; }

    string Name { get; }

    ProviderKind Kind { get; }

    Task<string> BuildAuthorizationUrlAsync(AuthorizationRequest request, CancellationToken cancellationToken);

    // The verified identity behind an authorization code; anything else is an ExternalLoginException.
    Task<ExternalIdentity> ExchangeAsync(CodeExchange exchange, CancellationToken cancellationToken);
}

// Proof Key for Code Exchange (RFC 7636), S256 only: an intercepted code is useless without the verifier.
internal static class Pkce
{
    // 32 random bytes as base64url: 43 characters, the RFC's minimum length, from its allowed alphabet.
    internal static string NewVerifier() => SessionTokens.NewToken();

    internal static string Challenge(string verifier) =>
        Base64Url.EncodeToString(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
}

internal static class Secrets
{
    // Comparing secrets (state, nonce) in constant time, so timing doesn't reveal how much of a guess matched.
    internal static bool Equal(string? actual, string expected) =>
        actual is not null && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(actual), Encoding.UTF8.GetBytes(expected));
}
