using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace Airbnb.PaymentProvider.Tests;

// The provider in memory, one per test (its charges live in memory), its webhooks caught by a WebhookInbox and its
// clock settable.
public sealed class ProviderApp : IAsyncDisposable
{
    public const string ApiKey = "test-api-key";
    public const string WebhookSecret = "test-webhook-secret";
    public const string WebhookUrl = "http://payments.test/webhooks/provider";

    private readonly WebApplicationFactory<Program> _factory;

    public ProviderApp(Action<IWebHostBuilder>? configure = null)
    {
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Provider:ApiKey", ApiKey)
                .UseSetting("Provider:WebhookUrl", WebhookUrl)
                .UseSetting("Provider:WebhookSecret", WebhookSecret)
                .UseSetting("Provider:SlowCardDelay", "00:00:00.3")
                .UseSetting("Provider:WebhookRetryDelay", "00:00:00.05");
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton<TimeProvider>(Clock);
                services.AddHttpClient("webhooks").ConfigurePrimaryHttpMessageHandler(() => Inbox);
            });
            configure?.Invoke(builder);
        });
    }

    public WebhookInbox Inbox { get; } = new();

    public MutableClock Clock { get; } = new(DateTimeOffset.UtcNow);

    public HttpClient Client(string? apiKey = ApiKey)
    {
        var client = _factory.CreateClient();
        if (apiKey is not null)
        {
            client.DefaultRequestHeaders.Add("X-Api-Key", apiKey);
        }
        return client;
    }

    public ValueTask DisposeAsync() => _factory.DisposeAsync();

    public static object Charge(string reference, string number, decimal amount = 250m) => new
    {
        reference,
        amount,
        currency = "USD",
        card = new { number, expMonth = 12, expYear = 2030, cvc = "123" },
    };

    public static string NewReference() => $"bk_{Guid.NewGuid():N}";

    public static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
}

// Real timers, a clock the test moves: what the provider stamps on events and signatures.
public sealed class MutableClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;

    public override DateTimeOffset GetUtcNow() => Now;
}

// Stands in for the payment service's webhook endpoint: records every delivery attempt, and answers 500 to the first
// FailFirst(n) of them.
public sealed class WebhookInbox : HttpMessageHandler
{
    private readonly ConcurrentQueue<Delivery> _deliveries = new();
    private int _failuresLeft;

    public sealed record Delivery(Uri Url, byte[] Body, string? Signature, HttpStatusCode Answer)
    {
        private JsonElement Json => JsonDocument.Parse(Body).RootElement;

        public string EventId => Json.GetProperty("id").GetString()!;

        public string Type => Json.GetProperty("type").GetString()!;

        public long Created => Json.GetProperty("created").GetInt64();

        public JsonElement Charge => Json.GetProperty("data").GetProperty("object");

        public string Reference => Charge.GetProperty("reference").GetString()!;
    }

    // Runs on each attempt before it's answered.
    public Action<Delivery>? OnDelivery { get; set; }

    public void FailFirst(int count) => _failuresLeft = count;

    public IReadOnlyList<Delivery> For(string reference) => [.. _deliveries.Where(d => d.Reference == reference)];

    public async Task<IReadOnlyList<Delivery>> WaitForAsync(string reference, int count, TimeSpan? timeout = null)
    {
        var deadline = DateTime.UtcNow + (timeout ?? TimeSpan.FromSeconds(5));
        while (For(reference).Count < count && DateTime.UtcNow < deadline)
        {
            await Task.Delay(20, TestContext.Current.CancellationToken);
        }
        return For(reference);
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var body = await request.Content!.ReadAsByteArrayAsync(cancellationToken);
        var signature = request.Headers.TryGetValues("Provider-Signature", out var values) ? values.Single() : null;
        var answer = Interlocked.Decrement(ref _failuresLeft) >= 0 ? HttpStatusCode.InternalServerError : HttpStatusCode.OK;
        var delivery = new Delivery(request.RequestUri!, body, signature, answer);
        OnDelivery?.Invoke(delivery);
        _deliveries.Enqueue(delivery);
        return new HttpResponseMessage(answer);
    }
}

// Stripe's scheme, checked here independently of the provider: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">.
public static class Signature
{
    public static bool Verifies(string? header, byte[] body, string secret, out long timestamp)
    {
        timestamp = 0;
        if (header is null)
        {
            return false;
        }
        var parts = header.Split(',').Select(part => part.Split('=', 2)).ToDictionary(part => part[0], part => part[1]);
        timestamp = long.Parse(parts["t"]);
        byte[] signed = [.. Encoding.UTF8.GetBytes($"{timestamp}."), .. body];
        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), signed);
        return Convert.ToHexStringLower(expected) == parts["v1"];
    }
}
