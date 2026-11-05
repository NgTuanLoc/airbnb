namespace Airbnb.PaymentProvider;

public static class ChargeStatus
{
    public const string Processing = "processing";
    public const string Succeeded = "succeeded";
    public const string Declined = "declined";
    public const string Refunded = "refunded";
    public const string Disputed = "disputed";
}

// No card data: the number decides the outcome and is gone.
public sealed record Charge(string Id, string Reference, decimal Amount, string Currency, string Status, string? DeclineReason);

public enum Refusal
{
    NotFound,
    IdempotencyConflict,
    ProcessingError,
    StillProcessing,
    NotDisputable,
}

public sealed record ChargeResult(Charge? Charge, Refusal? Refusal = null);

// The provider's books: one charge per reference (the merchant's idempotency key), decided by Stripe-style test card
// numbers. Nothing is charged. Every change of a charge is reported by webhook.
public sealed class Charges(ProviderSettings settings, Webhooks webhooks, TimeProvider time, IHostApplicationLifetime lifetime)
{
    private const string DeclinedCard = "4000000000000002";
    private const string InsufficientFundsCard = "4000000000009995";
    private const string FlakyCard = "4000000000000119";
    private const string SlowCard = "4000000000000077";
    private const int FlakyFailures = 2;

    // ponytail: one lock over in-memory books; a restart forgets every charge and pending delivery (a real provider
    // persists both and retries for days). The payment service's reconcile-on-read covers what's lost.
    private readonly Lock _lock = new();
    private readonly Dictionary<string, Charge> _charges = [];
    private readonly Dictionary<string, int> _flakyAttempts = [];

    public ChargeResult Create(string reference, decimal amount, string currency, string cardNumber)
    {
        var number = cardNumber.Replace(" ", "");
        Charge charge;
        lock (_lock)
        {
            if (_charges.TryGetValue(reference, out var existing))
            {
                return existing.Amount == amount ? new ChargeResult(existing) : new ChargeResult(null, Refusal.IdempotencyConflict);
            }
            // Fails before anything is recorded, so the same reference can simply be tried again.
            if (number == FlakyCard)
            {
                var attempts = _flakyAttempts.GetValueOrDefault(reference) + 1;
                _flakyAttempts[reference] = attempts;
                if (attempts <= FlakyFailures)
                {
                    return new ChargeResult(null, Refusal.ProcessingError);
                }
            }
            var id = $"ch_{Guid.NewGuid():N}";
            charge = number switch
            {
                DeclinedCard => new Charge(id, reference, amount, currency, ChargeStatus.Declined, "card_declined"),
                InsufficientFundsCard => new Charge(id, reference, amount, currency, ChargeStatus.Declined, "insufficient_funds"),
                SlowCard => new Charge(id, reference, amount, currency, ChargeStatus.Processing, null),
                _ => new Charge(id, reference, amount, currency, ChargeStatus.Succeeded, null),
            };
            _charges[reference] = charge;
        }

        if (charge.Status == ChargeStatus.Processing)
        {
            _ = SettleLaterAsync(reference);
        }
        else
        {
            webhooks.Send(charge.Status == ChargeStatus.Succeeded ? "charge.succeeded" : "charge.failed", charge);
        }
        return new ChargeResult(charge);
    }

    public Charge? Find(string reference)
    {
        lock (_lock)
        {
            return _charges.GetValueOrDefault(reference);
        }
    }

    // Gives the money back. A charge with nothing taken (declined) or already given back stays as it is; one still
    // processing can't be refunded until it settles.
    public ChargeResult Refund(string reference)
    {
        Charge charge;
        lock (_lock)
        {
            if (!_charges.TryGetValue(reference, out var found))
            {
                return new ChargeResult(null, Refusal.NotFound);
            }
            if (found.Status == ChargeStatus.Processing)
            {
                return new ChargeResult(null, Refusal.StillProcessing);
            }
            if (found.Status != ChargeStatus.Succeeded)
            {
                return new ChargeResult(found);
            }
            charge = found with { Status = ChargeStatus.Refunded };
            _charges[reference] = charge;
        }
        webhooks.Send("charge.refunded", charge);
        return new ChargeResult(charge);
    }

    // The guest's bank contests the charge: only a succeeded one can be.
    public ChargeResult Dispute(string reference)
    {
        Charge charge;
        lock (_lock)
        {
            if (!_charges.TryGetValue(reference, out var found))
            {
                return new ChargeResult(null, Refusal.NotFound);
            }
            if (found.Status != ChargeStatus.Succeeded)
            {
                return new ChargeResult(null, Refusal.NotDisputable);
            }
            charge = found with { Status = ChargeStatus.Disputed };
            _charges[reference] = charge;
        }
        webhooks.Send("charge.dispute.created", charge);
        return new ChargeResult(charge);
    }

    // The slow card succeeds after SlowCardDelay, and only the webhook says so.
    private async Task SettleLaterAsync(string reference)
    {
        try
        {
            await Task.Delay(settings.SlowCardDelay, time, lifetime.ApplicationStopping);
        }
        catch (OperationCanceledException)
        {
            return;
        }
        Charge? settled = null;
        lock (_lock)
        {
            if (_charges.TryGetValue(reference, out var charge) && charge.Status == ChargeStatus.Processing)
            {
                settled = charge with { Status = ChargeStatus.Succeeded };
                _charges[reference] = settled;
            }
        }
        if (settled is not null)
        {
            webhooks.Send("charge.succeeded", settled);
        }
    }
}
