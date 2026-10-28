using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Airbnb.Modules.Bookings.Payments;

internal enum ChargeStatus
{
    Succeeded,
    Declined,
    InvalidCard,
    // The payment service refused us (wrong or missing service key): nothing was charged.
    Unavailable,
    // No answer after every attempt (or one we can't act on): the booking stays pending for the reconciler.
    Unknown,
}

internal sealed record ChargeResult(ChargeStatus Status, string? DeclineReason = null);

// The payment service over HTTP (Aspire service discovery: http://payments). Every request carries the shared service
// key. The card is passed through once and never stored or logged here.
internal sealed class PaymentsClient(IHttpClientFactory httpClients, IConfiguration configuration, ILogger<PaymentsClient> logger)
{
    internal const string Name = "payments";
    private const int MaxAttempts = 3;
    private static readonly TimeSpan Backoff = TimeSpan.FromMilliseconds(200);

    private TimeSpan AttemptTimeout => configuration.GetValue("Bookings:Payments:AttemptTimeout", TimeSpan.FromSeconds(4));

    // POST is retried on timeouts and 5xx: the booking id is the payment service's idempotency key, so a retry can't charge twice.
    public async Task<ChargeResult> ChargeAsync(string bookingId, decimal amount, CreateBooking.CardInput card, CancellationToken cancellationToken)
    {
        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            if (attempt > 1)
            {
                await Task.Delay(Backoff * (attempt - 1), cancellationToken);
            }
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(AttemptTimeout);
            try
            {
                using var request = Request(HttpMethod.Post, "/payments");
                request.Content = JsonContent.Create(new { bookingId, amount, card });
                using var response = await httpClients.CreateClient(Name).SendAsync(request, timeout.Token);
                switch (response.StatusCode)
                {
                    case HttpStatusCode.Created:
                        return new ChargeResult(ChargeStatus.Succeeded);
                    case HttpStatusCode.PaymentRequired:
                        var body = await response.Content.ReadFromJsonAsync<JsonElement>(timeout.Token);
                        return new ChargeResult(ChargeStatus.Declined, body.TryGetProperty("declineReason", out var reason) ? reason.GetString() : null);
                    case HttpStatusCode.BadRequest:
                        return new ChargeResult(ChargeStatus.InvalidCard);
                    case HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden:
                        // Configuration, not a passing outage: the two sides disagree on Payments:ServiceKey.
                        logger.LogError("Charging booking {BookingId}: the payment service refused our service key", bookingId);
                        return new ChargeResult(ChargeStatus.Unavailable);
                    case >= HttpStatusCode.InternalServerError:
                        logger.LogWarning("Charging booking {BookingId}: attempt {Attempt} answered {Status}", bookingId, attempt, (int)response.StatusCode);
                        continue;
                    default:
                        logger.LogWarning("Charging booking {BookingId}: unexpected {Status}", bookingId, (int)response.StatusCode);
                        return new ChargeResult(ChargeStatus.Unknown);
                }
            }
            catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException && !cancellationToken.IsCancellationRequested)
            {
                logger.LogWarning("Charging booking {BookingId}: attempt {Attempt} got no answer ({Error})", bookingId, attempt, exception.GetType().Name);
            }
        }
        return new ChargeResult(ChargeStatus.Unknown);
    }

    // The payment's status, or null when the service has none for the booking. Throws when the service doesn't answer.
    public async Task<string?> StatusAsync(string bookingId, CancellationToken cancellationToken)
    {
        using var request = Request(HttpMethod.Get, $"/payments/{Uri.EscapeDataString(bookingId)}");
        using var response = await httpClients.CreateClient(Name).SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken)).GetProperty("status").GetString();
    }

    // Compensation. True once nothing can be charged any more: voided now, or there was no payment.
    public async Task<bool> VoidAsync(string bookingId, CancellationToken cancellationToken)
    {
        try
        {
            using var request = Request(HttpMethod.Post, $"/payments/{Uri.EscapeDataString(bookingId)}/void");
            using var response = await httpClients.CreateClient(Name).SendAsync(request, cancellationToken);
            return response.IsSuccessStatusCode || response.StatusCode == HttpStatusCode.NotFound;
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException && !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("Voiding booking {BookingId}'s payment got no answer ({Error})", bookingId, exception.GetType().Name);
            return false;
        }
    }

    private HttpRequestMessage Request(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Add("X-Service-Key", configuration["Payments:ServiceKey"]);
        return request;
    }
}
