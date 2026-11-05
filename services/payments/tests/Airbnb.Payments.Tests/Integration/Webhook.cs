using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Airbnb.Payments.Tests.Integration;

// The provider's side of a webhook: its event JSON, signed its way (Stripe's scheme), computed here independently of
// the service's own verification.
public static class Webhook
{
    public static string NewEventId() => $"evt_{Guid.NewGuid():N}";

    public static string Event(string type, string reference, string status, string? declineReason = null, string? id = null) =>
        JsonSerializer.Serialize(new
        {
            id = id ?? NewEventId(),
            type,
            created = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            data = new { @object = new { id = $"ch_{reference}", reference, amount = 250m, currency = "USD", status, declineReason } },
        });

    public static string Sign(byte[] body, string secret, DateTimeOffset at)
    {
        var t = at.ToUnixTimeSeconds();
        byte[] signed = [.. Encoding.UTF8.GetBytes($"{t}."), .. body];
        return $"t={t},v1={Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), signed))}";
    }

    public static Task<HttpResponseMessage> PostSignedAsync(PaymentsFixture fixture, string body)
    {
        var bytes = Encoding.UTF8.GetBytes(body);
        return PostAsync(fixture, new ByteArrayContent(bytes), Sign(bytes, PaymentsFixture.WebhookSecret, DateTimeOffset.UtcNow));
    }

    // As the provider would: no service key, only the signature header (when there is one).
    public static async Task<HttpResponseMessage> PostAsync(PaymentsFixture fixture, HttpContent content, string? signature)
    {
        using var client = fixture.Service.CreateClient();
        content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/webhooks/provider") { Content = content };
        if (signature is not null)
        {
            request.Headers.TryAddWithoutValidation("Provider-Signature", signature);
        }
        return await client.SendAsync(request, TestContext.Current.CancellationToken);
    }
}
