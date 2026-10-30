using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Airbnb.Api.Tests.Infrastructure;

// The payment service's HTTP contract in memory, swapped in as the "payments" client's primary handler. Cards decide
// the outcome; Settle lets a test change what the service says about a booking afterwards.
public sealed class FakePaymentService : HttpMessageHandler
{
    public const string ServiceKey = "test-service-key";
    public const string Good = "4242424242424242";
    public const string Declined = "4000000000000002";
    public const string InsufficientFunds = "4000000000009995";
    public const string Invalid = "4242424242424241";
    // Never answers: every attempt times out and nothing is recorded.
    public const string Unanswered = "4000000000000077";
    // The first attempt times out, the retry succeeds.
    public const string TimesOutOnce = "4000000000000119";

    private readonly ConcurrentDictionary<string, string> _statuses = new();
    private readonly ConcurrentDictionary<string, int> _attempts = new();
    private readonly ConcurrentBag<string> _voids = [];

    public string? StatusOf(string bookingId) => _statuses.GetValueOrDefault(bookingId);

    public int AttemptsFor(string bookingId) => _attempts.GetValueOrDefault(bookingId);

    public bool WasVoided(string bookingId) => _voids.Contains(bookingId);

    public void Settle(string bookingId, string status) => _statuses[bookingId] = status;

    // Runs while a void is in flight, before it answers: lets a test race something against it.
    public Func<string, Task>? OnVoid { get; set; }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (!request.Headers.TryGetValues("X-Service-Key", out var keys) || keys.Single() != ServiceKey)
        {
            return new HttpResponseMessage(HttpStatusCode.Unauthorized);
        }
        var segments = request.RequestUri!.AbsolutePath.Trim('/').Split('/');
        return (request.Method.Method, segments) switch
        {
            ("POST", ["payments"]) => await ChargeAsync(request, cancellationToken),
            ("GET", ["payments", var id]) => _statuses.TryGetValue(id, out var status) ? Json(HttpStatusCode.OK, new { bookingId = id, status }) : new(HttpStatusCode.NotFound),
            ("POST", ["payments", var id, "void"]) => await VoidAsync(id),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound),
        };
    }

    private async Task<HttpResponseMessage> ChargeAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var body = await request.Content!.ReadFromJsonAsync<JsonElement>(cancellationToken);
        var bookingId = body.GetProperty("bookingId").GetString()!;
        var number = body.GetProperty("card").GetProperty("number").GetString()!.Replace(" ", "");
        var attempt = _attempts.AddOrUpdate(bookingId, 1, (_, n) => n + 1);

        if (number == Unanswered || (number == TimesOutOnce && attempt == 1))
        {
            await Task.Delay(Timeout.Infinite, cancellationToken);
        }
        if (number == Invalid)
        {
            return Json(HttpStatusCode.BadRequest, new { code = "invalid_card", error = "Check your card details" });
        }
        var reason = number switch { Declined => "card_declined", InsufficientFunds => "insufficient_funds", _ => null };
        var status = _statuses.GetOrAdd(bookingId, reason is null ? "succeeded" : "declined");
        return status == "succeeded"
            ? Json(HttpStatusCode.Created, new { bookingId, status, brand = "visa", last4 = number[^4..] })
            : Json(HttpStatusCode.PaymentRequired, new { bookingId, status, declineReason = reason });
    }

    private async Task<HttpResponseMessage> VoidAsync(string bookingId)
    {
        _voids.Add(bookingId);
        if (OnVoid is { } onVoid)
        {
            await onVoid(bookingId);
        }
        if (!_statuses.ContainsKey(bookingId))
        {
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        }
        var status = _statuses.AddOrUpdate(bookingId, "voided", (_, current) => current is "succeeded" or "processing" ? "voided" : current);
        return Json(HttpStatusCode.OK, new { bookingId, status });
    }

    private static HttpResponseMessage Json(HttpStatusCode code, object body) => new(code) { Content = JsonContent.Create(body) };
}
