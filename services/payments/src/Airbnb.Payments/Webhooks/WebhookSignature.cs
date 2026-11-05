using System.Security.Cryptography;
using System.Text;

namespace Airbnb.Payments.Webhooks;

// The provider signs each webhook the way Stripe does: "t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">" with
// the secret both sides share. The timestamp is inside the signature, so an old request can't be replayed later.
public static class WebhookSignature
{
    public const string Header = "Provider-Signature";
    public static readonly TimeSpan Tolerance = TimeSpan.FromMinutes(5);

    // Any v1 may match, so the provider can sign with an old and a new secret while one replaces the other.
    public static bool IsValid(string? header, ReadOnlySpan<byte> body, string secret, DateTimeOffset now)
    {
        long? timestamp = null;
        var signatures = new List<string>();
        foreach (var part in (header ?? "").Split(','))
        {
            var pair = part.Split('=', 2);
            if (pair is ["t", var t] && long.TryParse(t, out var seconds))
            {
                timestamp = seconds;
            }
            else if (pair is ["v1", var v1])
            {
                signatures.Add(v1);
            }
        }

        var nowSeconds = now.ToUnixTimeSeconds();
        var tolerance = (long)Tolerance.TotalSeconds;
        if (timestamp is not { } signedAt || signatures.Count == 0 || signedAt < nowSeconds - tolerance || signedAt > nowSeconds + tolerance)
        {
            return false;
        }
        byte[] signed = [.. Encoding.UTF8.GetBytes($"{signedAt}."), .. body];
        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), signed);
        return signatures.Exists(signature => Matches(expected, signature));
    }

    private static bool Matches(byte[] expected, string signature)
    {
        try
        {
            return CryptographicOperations.FixedTimeEquals(expected, Convert.FromHexString(signature));
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
