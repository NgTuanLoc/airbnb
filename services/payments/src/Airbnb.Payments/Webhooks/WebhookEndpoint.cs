using System.Text.Json;
using Airbnb.Payments.Api;
using Airbnb.Payments.Data;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Airbnb.Payments.Webhooks;

// The provider's event, as much of it as this service reads.
public sealed record ProviderEvent(string? Id, string? Type, ProviderEventData? Data);

public sealed record ProviderEventData(ProviderEventCharge? Object);

public sealed record ProviderEventCharge(string? Reference, string? Status, string? DeclineReason);

// POST /webhooks/provider: the provider telling this service what happened to a charge. No service key: the signature
// is the authentication. Events can arrive twice, late or out of order; each changes a payment only from the status
// it expects, so a repeat or a stale one changes nothing.
public static class WebhookEndpoint
{
    private const int MaxBodyBytes = 64 * 1024;
    private const int MaxIdLength = 64;

    public static void MapProviderWebhooks(this IEndpointRouteBuilder app) => app.MapPost("/webhooks/provider", ReceiveAsync);

    private static async Task<IResult> ReceiveAsync(HttpRequest request, IDbContextOutbox<PaymentsDbContext> outbox, IConfiguration configuration,
        TimeProvider time, ILoggerFactory loggers, CancellationToken ct)
    {
        // The raw bytes, before anything parses them: the signature covers exactly what was sent.
        if (await ReadCappedAsync(request, ct) is not { } body)
        {
            return Results.Json(new ErrorDto("too_large", "A webhook is at most 64 KB"), statusCode: StatusCodes.Status413PayloadTooLarge);
        }
        if (!WebhookSignature.IsValid(request.Headers[WebhookSignature.Header], body, configuration["Payments:WebhookSecret"]!, time.GetUtcNow()))
        {
            return Results.BadRequest(new ErrorDto("invalid_signature", "The webhook's signature doesn't verify"));
        }
        if (Parse(body) is not { Id: { Length: > 0 and <= MaxIdLength } id, Type: { Length: > 0 and <= MaxIdLength } type } providerEvent)
        {
            return Results.BadRequest(new ErrorDto("invalid_event", "The webhook isn't an event"));
        }

        await ApplyAsync(outbox, id, type, providerEvent.Data?.Object, time.GetUtcNow(), loggers.CreateLogger(typeof(WebhookEndpoint)), ct);
        return Results.Ok();
    }

    // Null past the cap, counted while reading, so it holds whatever Content-Length says (a chunked body has none).
    private static async Task<byte[]?> ReadCappedAsync(HttpRequest request, CancellationToken ct)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[8192];
        while (true)
        {
            var read = await request.Body.ReadAsync(chunk, ct);
            if (read == 0)
            {
                return buffer.ToArray();
            }
            if (buffer.Length + read > MaxBodyBytes)
            {
                return null;
            }
            buffer.Write(chunk, 0, read);
        }
    }

    private static ProviderEvent? Parse(byte[] body)
    {
        try
        {
            return JsonSerializer.Deserialize<ProviderEvent>(body, JsonSerializerOptions.Web);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    // One transaction: the event's receipt, the payment's change and (for a settlement) its announcement.
    private static async Task ApplyAsync(IDbContextOutbox<PaymentsDbContext> outbox, string eventId, string type, ProviderEventCharge? charge,
        DateTimeOffset now, ILogger logger, CancellationToken ct)
    {
        var db = outbox.DbContext;
        await db.Database.BeginTransactionAsync(ct);
        if (await db.TryRecordEventAsync(eventId, type, now, ct) && charge?.Reference is { } bookingId)
        {
            switch (type)
            {
                case "charge.succeeded":
                    await outbox.TrySettleAsync(bookingId, PaymentStatus.Succeeded, null, now, ct);
                    return;
                case "charge.failed":
                    await outbox.TrySettleAsync(bookingId, PaymentStatus.Declined, charge.DeclineReason, now, ct);
                    return;
                case "charge.refunded":
                    await MoveAsync(db, bookingId, PaymentStatus.Succeeded, PaymentStatus.Refunded, now, ct);
                    break;
                case "charge.dispute.created":
                    if (await MoveAsync(db, bookingId, PaymentStatus.Succeeded, PaymentStatus.Disputed, now, ct))
                    {
                        logger.LogWarning("Booking {BookingId}'s payment was disputed by the guest's bank", bookingId);
                    }
                    break;
            }
        }
        // Commits the receipt (and any change); a repeated event wrote nothing.
        await outbox.SaveChangesAndFlushMessagesAsync(ct);
    }

    private static async Task<bool> MoveAsync(PaymentsDbContext db, string bookingId, string from, string to, DateTimeOffset now, CancellationToken ct) =>
        await db.Payments.Where(p => p.BookingId == bookingId && p.Status == from)
            .ExecuteUpdateAsync(set => set.SetProperty(p => p.Status, to).SetProperty(p => p.UpdatedAt, now), ct) == 1;
}
