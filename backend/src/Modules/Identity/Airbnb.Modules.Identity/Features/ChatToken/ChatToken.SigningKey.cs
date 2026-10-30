using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace Airbnb.Modules.Identity;

internal static partial class ChatToken
{
    internal const string SigningKeySetting = "Identity:ChatToken:SigningKey";
    internal const string Issuer = "airbnb-identity";
    internal const string Audience = "chat";
    internal static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(10);
    private const int MinKeyLength = 32;

    // Null when chat is off (no key). A key too short to sign with safely fails the host at startup.
    internal static SymmetricSecurityKey? SigningKey(IConfiguration configuration)
    {
        var key = configuration[SigningKeySetting];
        if (string.IsNullOrEmpty(key))
        {
            return null;
        }
        if (key.Length < MinKeyLength)
        {
            throw new InvalidOperationException($"{SigningKeySetting} must be at least {MinKeyLength} characters");
        }
        return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
    }
}
