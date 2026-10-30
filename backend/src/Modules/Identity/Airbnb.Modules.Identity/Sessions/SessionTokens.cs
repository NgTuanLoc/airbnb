using System.Security.Cryptography;
using System.Text;

namespace Airbnb.Modules.Identity;

// Opaque bearer tokens: the caller holds the token, the database only its SHA-256 (spec §1).
internal static class SessionTokens
{
    private const int TokenBytes = 32;

    internal static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    internal static string NewToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(TokenBytes)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    internal static string Hash(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
