using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace Airbnb.Payments.Tests.Integration;

// The payment provider's HTTP contract in memory, swapped in as the "payment-provider" client's primary handler. Cards
// decide as at the real fake provider; three more exist only here. Settle changes what it says about a charge later.
public sealed class FakeProvider : HttpMessageHandler
{
    public const string Good = "4242424242424242";
    public const string Declined = "4000000000000002";
    public const string InsufficientFunds = "4000000000009995";
    public const string Flaky = "4000000000000119";
    public const string Slow = "4000000000000077";
    // Never answers: every attempt times out.
    public const string NeverAnswers = "4000000000000341";
    // Succeeds, but answers only after half a second.
    public const string AnswersLate = "4000000000003220";
    // Refused with a 400: nothing charged.
    public const string Refused = "4000000000000101";

    private readonly ConcurrentDictionary<string, (string Status, string? Reason)> _charges = new();
    private readonly ConcurrentDictionary<string, int> _chargeRequests = new();
    private readonly ConcurrentDictionary<string, Func<Task>> _beforeAnswer = new();

    // Runs once, after the reference's charge is recorded and before it's answered: lets a test land a webhook first.
    public void BeforeAnswering(string reference, Func<Task> action) => _beforeAnswer[reference] = action;

    public int ChargeRequests(string reference) => _chargeRequests.GetValueOrDefault(reference);

    public string? StatusOf(string reference) => _charges.TryGetValue(reference, out var charge) ? charge.Status : null;

    public void Settle(string reference, string status, string? reason = null) => _charges[reference] = (status, reason);

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        if (!request.Headers.TryGetValues("X-Api-Key", out var keys) || keys.Single() != PaymentsFixture.ProviderKey)
        {
            return new HttpResponseMessage(HttpStatusCode.Unauthorized);
        }
        var segments = request.RequestUri!.AbsolutePath.Trim('/').Split('/');
        return (request.Method.Method, segments) switch
        {
            ("POST", ["charges"]) => await ChargeAsync(request, cancellationToken),
            ("GET", ["charges", var reference]) => _charges.TryGetValue(reference, out var charge)
                ? Json(HttpStatusCode.OK, Charge(reference, charge.Status, charge.Reason))
                : new HttpResponseMessage(HttpStatusCode.NotFound),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound),
        };
    }

    private async Task<HttpResponseMessage> ChargeAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var body = await request.Content!.ReadFromJsonAsync<JsonElement>(cancellationToken);
        var reference = body.GetProperty("reference").GetString()!;
        var number = body.GetProperty("card").GetProperty("number").GetString()!.Replace(" ", "");
        var attempt = _chargeRequests.AddOrUpdate(reference, 1, (_, n) => n + 1);

        switch (number)
        {
            case NeverAnswers:
                await Task.Delay(Timeout.Infinite, cancellationToken);
                break;
            case AnswersLate:
                await Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken);
                break;
            case Refused:
                return Json(HttpStatusCode.BadRequest, new { code = "invalid_request", error = "Refused" });
            case Flaky when attempt <= 2:
                return Json(HttpStatusCode.InternalServerError, new { code = "processing_error", error = "Try again" });
        }
        var decided = number switch
        {
            Declined => ("declined", "card_declined"),
            InsufficientFunds => ("declined", "insufficient_funds"),
            Slow => ("processing", (string?)null),
            _ => ("succeeded", null),
        };
        var (status, reason) = _charges.GetOrAdd(reference, decided);
        if (_beforeAnswer.TryRemove(reference, out var beforeAnswer))
        {
            await beforeAnswer();
        }
        return Json(HttpStatusCode.OK, Charge(reference, status, reason));
    }

    private static object Charge(string reference, string status, string? reason) =>
        new { id = $"ch_{reference}", reference, amount = 250m, currency = "USD", status, declineReason = reason };

    private static HttpResponseMessage Json(HttpStatusCode code, object body) => new(code) { Content = JsonContent.Create(body) };
}
