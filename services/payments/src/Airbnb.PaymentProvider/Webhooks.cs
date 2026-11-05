using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Airbnb.PaymentProvider;

// Stripe's event shape: { id, type, created, data: { object: <charge> } }.
public sealed record ProviderEvent(string Id, string Type, long Created, EventData Data);

public sealed record EventData(Charge Object);

// Tells the payment service about every change of a charge: a POST to Provider:WebhookUrl, signed with the shared
// secret, tried until it answers 2xx.
public sealed class Webhooks(
    IHttpClientFactory httpClients, ProviderSettings settings, TimeProvider time, IHostApplicationLifetime lifetime, ILogger<Webhooks> logger)
{
    public const string ClientName = "webhooks";
    public const string SignatureHeader = "Provider-Signature";
    private const int MaxAttempts = 6;
    private const int KeptEvents = 100;

    // The latest events, for resending.
    private readonly ConcurrentQueue<ProviderEvent> _recent = new();

    public void Send(string type, Charge charge)
    {
        var providerEvent = new ProviderEvent($"evt_{Guid.NewGuid():N}", type, time.GetUtcNow().ToUnixTimeSeconds(), new EventData(charge));
        _recent.Enqueue(providerEvent);
        if (_recent.Count > KeptEvents)
        {
            _recent.TryDequeue(out _);
        }
        _ = DeliverAsync(providerEvent);
    }

    // The latest event again, same id: a duplicate the receiver must recognise.
    public ProviderEvent? ResendLatest()
    {
        var latest = _recent.LastOrDefault();
        if (latest is not null)
        {
            _ = DeliverAsync(latest);
        }
        return latest;
    }

    // Stripe's scheme: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">. The timestamp is signed with the body, so a
    // receiver can refuse old requests (replays).
    public static string Sign(ReadOnlySpan<byte> body, string secret, long timestamp)
    {
        byte[] signed = [.. Encoding.UTF8.GetBytes($"{timestamp}."), .. body];
        return $"t={timestamp},v1={Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), signed))}";
    }

    // Up to six attempts, waiting WebhookRetryDelay × 1, 5, 25, 125 and 625 between them, each signed afresh so a late
    // attempt still passes the receiver's timestamp check. Attempts of different events run side by side, so a
    // receiver can get them out of order.
    private async Task DeliverAsync(ProviderEvent providerEvent)
    {
        var body = JsonSerializer.SerializeToUtf8Bytes(providerEvent, JsonSerializerOptions.Web);
        var stopping = lifetime.ApplicationStopping;
        try
        {
            for (var attempt = 1; attempt <= MaxAttempts; attempt++)
            {
                if (attempt > 1)
                {
                    await Task.Delay(settings.WebhookRetryDelay * Math.Pow(5, attempt - 2), time, stopping);
                }
                if (await TryDeliverAsync(providerEvent, body, attempt, stopping))
                {
                    return;
                }
            }
            logger.LogError("Gave up delivering {EventId} ({Type}) after {Attempts} attempts", providerEvent.Id, providerEvent.Type, MaxAttempts);
        }
        catch (OperationCanceledException) when (stopping.IsCancellationRequested)
        {
            // Shutting down: in memory, so undelivered events are lost.
        }
    }

    private async Task<bool> TryDeliverAsync(ProviderEvent providerEvent, byte[] body, int attempt, CancellationToken stopping)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, settings.WebhookUrl) { Content = new ByteArrayContent(body) };
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        request.Headers.Add(SignatureHeader, Sign(body, settings.WebhookSecret, time.GetUtcNow().ToUnixTimeSeconds()));
        try
        {
            using var response = await httpClients.CreateClient(ClientName).SendAsync(request, stopping);
            if (response.IsSuccessStatusCode)
            {
                return true;
            }
            logger.LogWarning("Delivering {EventId} ({Type}): attempt {Attempt} answered {Status}",
                providerEvent.Id, providerEvent.Type, attempt, (int)response.StatusCode);
        }
        catch (Exception exception) when (!stopping.IsCancellationRequested)
        {
            logger.LogWarning(exception, "Delivering {EventId} ({Type}): attempt {Attempt} got no answer", providerEvent.Id, providerEvent.Type, attempt);
        }
        return false;
    }
}
