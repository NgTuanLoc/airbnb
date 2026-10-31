using System.Security.Cryptography;
using System.Text;

namespace Airbnb.Notifications;

// The admin endpoints (the AppHost dashboard's commands) take Notifications:AdminKey in a header. Without a configured
// key they don't exist (404).
internal static class AdminKey
{
    public const string Header = "X-Admin-Key";

    // Null when the key is right; otherwise the answer to send instead.
    public static IResult? Check(IConfiguration configuration, string? key)
    {
        var expected = configuration["Notifications:AdminKey"];
        if (string.IsNullOrEmpty(expected))
        {
            return TypedResults.NotFound();
        }
        return key is not null && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(key))
            ? null
            : TypedResults.Unauthorized();
    }
}
