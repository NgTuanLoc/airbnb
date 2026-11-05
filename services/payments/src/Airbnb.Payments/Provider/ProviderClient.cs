using System.Diagnostics.CodeAnalysis;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Airbnb.Payments.Cards;

namespace Airbnb.Payments.Provider;

// What the provider says about a charge.
public sealed record ProviderCharge(string Reference, string Status, string? DeclineReason);

public enum ChargeAnswerKind
{
    // The provider answered with the charge.
    Charged,
    // The provider said no (a 4xx): nothing was charged.
    Refused,
    // No answer after every attempt: the charge may or may not exist.
    NoAnswer,
}

public sealed record ChargeAnswer(ChargeAnswerKind Kind, ProviderCharge? Charge = null);

// The payment provider over HTTP (Aspire service discovery: http://payment-provider), with this service's API key on
// every request. The card is passed through once and never stored or logged here.
public sealed class ProviderClient(IHttpClientFactory httpClients, IConfiguration configuration, ILogger<ProviderClient> logger)
{
    public const string Name = "payment-provider";

    [SuppressMessage("Sonar", "S1075", Justification = "A service-discovery name, resolved from configuration, not a location")]
    public const string BaseUrl = "https+http://payment-provider";

    private const int MaxAttempts = 3;
    private static readonly TimeSpan Backoff = TimeSpan.FromMilliseconds(200);

    private TimeSpan AttemptTimeout => configuration.GetValue("Payments:ProviderAttemptTimeout", TimeSpan.FromSeconds(2));

    // ServiceDefaults' resilience handler doesn't retry POSTs, so charges are retried here, with the same reference each
    // time: it is the provider's idempotency key, so a retry can't charge twice. No cancellation from the caller: once
    // a charge may have been sent, its answer is worth waiting for.
    public async Task<ChargeAnswer> ChargeAsync(string reference, decimal amount, string currency, CardInput card)
    {
        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            if (attempt > 1)
            {
                await Task.Delay(Backoff * (attempt - 1));
            }
            using var timeout = new CancellationTokenSource(AttemptTimeout);
            try
            {
                using var request = Request(HttpMethod.Post, "/charges");
                request.Content = JsonContent.Create(new { reference, amount, currency, card });
                using var response = await httpClients.CreateClient(Name).SendAsync(request, timeout.Token);
                if (response.StatusCode == HttpStatusCode.OK)
                {
                    return new ChargeAnswer(ChargeAnswerKind.Charged, await ReadChargeAsync(response, timeout.Token));
                }
                if (IsRefusal(response.StatusCode))
                {
                    logger.LogError("Charging {Reference}: the provider refused it with {Status}", reference, (int)response.StatusCode);
                    return new ChargeAnswer(ChargeAnswerKind.Refused);
                }
                logger.LogWarning("Charging {Reference}: attempt {Attempt} answered {Status}", reference, attempt, (int)response.StatusCode);
            }
            catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException or JsonException)
            {
                logger.LogWarning(exception, "Charging {Reference}: attempt {Attempt} got no answer", reference, attempt);
            }
        }
        return new ChargeAnswer(ChargeAnswerKind.NoAnswer);
    }

    // The provider's charge for a reference, or null when it has none. Throws when it doesn't answer.
    public async Task<ProviderCharge?> FindAsync(string reference, CancellationToken cancellationToken)
    {
        using var request = Request(HttpMethod.Get, $"/charges/{Uri.EscapeDataString(reference)}");
        using var response = await httpClients.CreateClient(Name).SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
        response.EnsureSuccessStatusCode();
        return await ReadChargeAsync(response, cancellationToken);
    }

    // Gives whatever the provider took for the reference back. Done when it answers 200 (refunded, or nothing to give
    // back) or 404 (it never had the charge); throws otherwise, a charge still processing included.
    public async Task RefundAsync(string reference, CancellationToken cancellationToken)
    {
        using var request = Request(HttpMethod.Post, $"/charges/{Uri.EscapeDataString(reference)}/refund");
        using var response = await httpClients.CreateClient(Name).SendAsync(request, cancellationToken);
        if (response.StatusCode is not (HttpStatusCode.OK or HttpStatusCode.NotFound))
        {
            throw new HttpRequestException($"The provider didn't refund {reference}: {(int)response.StatusCode}", null, response.StatusCode);
        }
    }

    // A 4xx is the provider saying no, so nothing was charged; a 408 or 429 only asks to come back later.
    private static bool IsRefusal(HttpStatusCode status) =>
        (int)status is >= 400 and < 500 && status is not (HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests);

    private static async Task<ProviderCharge> ReadChargeAsync(HttpResponseMessage response, CancellationToken cancellationToken) =>
        await response.Content.ReadFromJsonAsync<ProviderCharge>(JsonSerializerOptions.Web, cancellationToken) is { Reference: not null, Status: not null } charge
            ? charge
            : throw new JsonException("The provider's answer has no charge");

    private HttpRequestMessage Request(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add("X-Api-Key", configuration["Payments:ProviderKey"]);
        return request;
    }
}
