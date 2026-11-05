using System.Security.Cryptography;
using System.Text;
using Airbnb.Payments.Cards;
using Airbnb.Payments.Data;
using Airbnb.Payments.Handlers;
using Airbnb.Payments.Provider;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Airbnb.Payments.Api;

public sealed record ChargeRequest(string? BookingId, decimal Amount, CardInput? Card);

public sealed record PaymentDto(string BookingId, string Status, decimal Amount, string Brand, string Last4, string? DeclineReason)
{
    public static PaymentDto From(Payment p) => new(p.BookingId, p.Status, p.Amount, p.Brand, p.Last4, p.DeclineReason);
}

public sealed record ErrorDto(string Code, string Error);

public static class PaymentEndpoints
{
    private const string Currency = "USD";
    private const decimal MaxAmount = 1_000_000m;
    private static readonly TimeSpan RefreshTimeout = TimeSpan.FromSeconds(2);

    public static void MapPayments(this IEndpointRouteBuilder app)
    {
        // Only the monolith calls this service; it sends the shared key on every request.
        var payments = app.MapGroup("/payments").AddEndpointFilter(RequireServiceKey);
        payments.MapPost("", ChargeAsync);
        payments.MapGet("/{bookingId}", ReadAsync);
        payments.MapPost("/{bookingId}/void", VoidAsync);
    }

    // A payment still processing is refreshed from the provider first. That recovers a webhook that never arrived (the
    // provider gave up, or this service was down): the monolith's reconciler reads every pending booking's payment.
    private static async Task<IResult> ReadAsync(string bookingId, IDbContextOutbox<PaymentsDbContext> outbox, ProviderClient provider,
        TimeProvider time, ILoggerFactory loggers, CancellationToken ct)
    {
        var db = outbox.DbContext;
        if (await db.Payments.AsNoTracking().SingleOrDefaultAsync(p => p.BookingId == bookingId, ct) is not { } payment)
        {
            return Results.NotFound();
        }
        if (payment.Status == PaymentStatus.Processing && await TryRefreshAsync(outbox, provider, bookingId, time, loggers, ct))
        {
            payment = await db.Payments.AsNoTracking().SingleAsync(p => p.BookingId == bookingId, ct);
        }
        return Results.Ok(PaymentDto.From(payment));
    }

    // Settles the payment as the provider now has it. False when nothing changed: still processing there, the
    // provider has no answer within RefreshTimeout, or another path settled it first.
    private static async Task<bool> TryRefreshAsync(IDbContextOutbox<PaymentsDbContext> outbox, ProviderClient provider, string bookingId,
        TimeProvider time, ILoggerFactory loggers, CancellationToken ct)
    {
        ProviderCharge? charge;
        using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct))
        {
            timeout.CancelAfter(RefreshTimeout);
            try
            {
                charge = await provider.FindAsync(bookingId, timeout.Token);
            }
            catch (Exception exception) when (!ct.IsCancellationRequested)
            {
                // The read answers with what's stored; the next one asks again.
                loggers.CreateLogger(typeof(PaymentEndpoints)).LogWarning(exception, "Refreshing booking {BookingId}'s payment got no answer", bookingId);
                return false;
            }
        }
        return charge is { Status: PaymentStatus.Succeeded or PaymentStatus.Declined }
            && await outbox.TrySettleAsync(bookingId, charge.Status, charge.DeclineReason, time.GetUtcNow(), ct);
    }

    // The booking id is the idempotency key, here and at the provider: a repeated request gets the stored outcome, never
    // a second charge.
    private static async Task<IResult> ChargeAsync(
        ChargeRequest request, IDbContextOutbox<PaymentsDbContext> outbox, ProviderClient provider, TimeProvider time, CancellationToken ct)
    {
        var db = outbox.DbContext;
        if (string.IsNullOrWhiteSpace(request.BookingId) || request.BookingId.Length > 40 || request.Amount is <= 0 or > MaxAmount)
        {
            return Results.BadRequest(new ErrorDto("invalid_request", "A booking id and an amount are required"));
        }
        var now = time.GetUtcNow();
        if (request.Card is null || CardValidator.Validate(request.Card, DateOnly.FromDateTime(now.UtcDateTime)) is not { } card)
        {
            return Results.BadRequest(new ErrorDto("invalid_card", "Check your card details"));
        }

        var claim = new Payment
        {
            BookingId = request.BookingId,
            Amount = request.Amount,
            Currency = Currency,
            Status = PaymentStatus.Processing,
            Brand = card.Brand,
            Last4 = card.Last4,
            CreatedAt = now,
            UpdatedAt = now,
        };
        if (!await db.TryClaimAsync(claim, ct))
        {
            var existing = await db.Payments.AsNoTracking().SingleAsync(p => p.BookingId == request.BookingId, ct);
            return existing.Amount != request.Amount && existing.Status != PaymentStatus.Voided
                ? Results.Conflict(new ErrorDto("idempotency_conflict", "This booking was already charged a different amount"))
                : Outcome(existing);
        }

        // From here on the caller's cancellation is ignored: a charge sent to the provider can't be taken back, so its
        // outcome must be recorded even when the monolith stops waiting (it reads it later, or voids it).
        var answer = await provider.ChargeAsync(request.BookingId, request.Amount, Currency, request.Card);
        ct = CancellationToken.None;
        switch (answer)
        {
            case { Kind: ChargeAnswerKind.Charged, Charge: { Status: PaymentStatus.Succeeded or PaymentStatus.Declined } charge }:
                // Only from processing: if the webhook got here first, or the monolith voided it meanwhile, that stands.
                await outbox.TrySettleAsync(request.BookingId, charge.Status, charge.DeclineReason, time.GetUtcNow(), ct);
                break;
            case { Kind: ChargeAnswerKind.Refused }:
                // Nothing was charged: release the claim so a retry can try again.
                await db.Payments.Where(p => p.BookingId == request.BookingId && p.Status == PaymentStatus.Processing).ExecuteDeleteAsync(ct);
                return Results.Json(new ErrorDto("processor_error", "The card processor is unavailable"), statusCode: StatusCodes.Status503ServiceUnavailable);
        }
        // Still processing, or no answer at all (the charge may exist): the webhook or a refresh settles it.
        return Outcome(await db.Payments.AsNoTracking().SingleAsync(p => p.BookingId == request.BookingId, ct));
    }

    private static IResult Outcome(Payment payment) => payment.Status switch
    {
        PaymentStatus.Succeeded => Results.Json(PaymentDto.From(payment), statusCode: StatusCodes.Status201Created),
        PaymentStatus.Declined => Results.Json(PaymentDto.From(payment), statusCode: StatusCodes.Status402PaymentRequired),
        PaymentStatus.Processing => Results.Json(PaymentDto.From(payment), statusCode: StatusCodes.Status202Accepted),
        _ => Results.Conflict(new ErrorDto($"payment_{payment.Status}", $"This booking's payment was {payment.Status}")),
    };

    // Compensation: the monolith gave up on the booking. Repeats are fine; a void before any charge blocks later ones.
    // Whatever the provider took goes back: the refund is queued in the same transaction (durably), and its handler
    // keeps asking while the charge is still processing there.
    private static async Task<IResult> VoidAsync(string bookingId, IDbContextOutbox<PaymentsDbContext> outbox, TimeProvider time, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(bookingId) || bookingId.Length > 40)
        {
            return Results.NotFound();
        }
        var db = outbox.DbContext;
        await db.Database.BeginTransactionAsync(ct);
        await db.VoidAsync(bookingId, time.GetUtcNow(), ct);
        await outbox.PublishAsync(new RefundPayment(bookingId));
        await outbox.SaveChangesAndFlushMessagesAsync(ct);
        return Results.Ok(PaymentDto.From(await db.Payments.AsNoTracking().SingleAsync(p => p.BookingId == bookingId, ct)));
    }

    private static async ValueTask<object?> RequireServiceKey(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var expected = http.RequestServices.GetRequiredService<IConfiguration>()["Payments:ServiceKey"];
        var presented = http.Request.Headers["X-Service-Key"].ToString();
        if (string.IsNullOrEmpty(expected) || string.IsNullOrEmpty(presented)
            || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(presented)))
        {
            return Results.Unauthorized();
        }
        return await next(context);
    }
}
