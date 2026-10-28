using System.Security.Cryptography;
using System.Text;
using Airbnb.Payments.Cards;
using Airbnb.Payments.Data;
using Microsoft.EntityFrameworkCore;

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

    public static void MapPayments(this IEndpointRouteBuilder app)
    {
        // Only the monolith calls this service; it sends the shared key on every request.
        var payments = app.MapGroup("/payments").AddEndpointFilter(RequireServiceKey);
        payments.MapPost("", ChargeAsync);
        payments.MapGet("/{bookingId}", async (string bookingId, PaymentsDbContext db, CancellationToken ct) =>
            await db.Payments.AsNoTracking().SingleOrDefaultAsync(p => p.BookingId == bookingId, ct) is { } payment
                ? Results.Ok(PaymentDto.From(payment))
                : Results.NotFound());
        payments.MapPost("/{bookingId}/void", VoidAsync);
    }

    // The booking id is the idempotency key: a repeated request gets the stored outcome, never a second charge.
    private static async Task<IResult> ChargeAsync(
        ChargeRequest request, PaymentsDbContext db, FakeProcessor processor, TimeProvider time, CancellationToken ct)
    {
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

        // From here on the caller's cancellation is ignored: a charge sent to the processor can't be taken back, so its
        // outcome must be recorded even when the monolith stops waiting (it reads it later, or voids it).
        var result = await processor.ChargeAsync(request.BookingId, card, request.Amount, CancellationToken.None);
        ct = CancellationToken.None;
        if (result.Outcome == ChargeOutcome.Error)
        {
            // Nothing was charged: release the claim so a retry can try again.
            await db.Payments.Where(p => p.BookingId == request.BookingId && p.Status == PaymentStatus.Processing).ExecuteDeleteAsync(ct);
            return Results.Json(new ErrorDto("processor_error", "The card processor is unavailable"), statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var status = result.Outcome == ChargeOutcome.Succeeded ? PaymentStatus.Succeeded : PaymentStatus.Declined;
        // Only from processing: if the monolith voided it meanwhile (it gave up waiting), the void stands.
        await db.Payments.Where(p => p.BookingId == request.BookingId && p.Status == PaymentStatus.Processing)
            .ExecuteUpdateAsync(set => set
                .SetProperty(p => p.Status, status)
                .SetProperty(p => p.DeclineReason, result.DeclineReason)
                .SetProperty(p => p.UpdatedAt, time.GetUtcNow()), ct);
        return Outcome(await db.Payments.AsNoTracking().SingleAsync(p => p.BookingId == request.BookingId, ct));
    }

    private static IResult Outcome(Payment payment) => payment.Status switch
    {
        PaymentStatus.Succeeded => Results.Json(PaymentDto.From(payment), statusCode: StatusCodes.Status201Created),
        PaymentStatus.Declined => Results.Json(PaymentDto.From(payment), statusCode: StatusCodes.Status402PaymentRequired),
        PaymentStatus.Processing => Results.Conflict(new ErrorDto("payment_in_progress", "This booking is being charged right now")),
        _ => Results.Conflict(new ErrorDto($"payment_{payment.Status}", $"This booking's payment was {payment.Status}")),
    };

    // Compensation: the monolith gave up on the booking. Repeats are fine; a void before any charge blocks later ones.
    private static async Task<IResult> VoidAsync(string bookingId, PaymentsDbContext db, TimeProvider time, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(bookingId) || bookingId.Length > 40)
        {
            return Results.NotFound();
        }
        await db.VoidAsync(bookingId, time.GetUtcNow(), ct);
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
