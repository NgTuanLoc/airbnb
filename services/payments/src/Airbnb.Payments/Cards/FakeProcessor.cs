using System.Collections.Concurrent;

namespace Airbnb.Payments.Cards;

public enum ChargeOutcome
{
    Succeeded,
    Declined,
    Error,
}

public sealed record ChargeResult(ChargeOutcome Outcome, string? DeclineReason = null);

// Stands in for a card processor, driven by Stripe-style test card numbers (spec: "Test cards"). Nothing is charged.
public sealed class FakeProcessor(TimeSpan slowCardDelay)
{
    private const string Declined = "4000000000000002";
    private const string InsufficientFunds = "4000000000009995";
    private const string Flaky = "4000000000000119";
    private const string Slow = "4000000000000077";
    private const int FlakyFailures = 2;

    // How often the flaky card was tried per booking, so its retries succeed on the third attempt. In memory: a restart
    // forgets it, which only makes the next attempt fail again.
    private readonly ConcurrentDictionary<string, int> _flakyAttempts = new();

    public async Task<ChargeResult> ChargeAsync(string bookingId, ValidCard card, decimal amount, CancellationToken cancellationToken)
    {
        switch (card.Number)
        {
            case Declined:
                return new ChargeResult(ChargeOutcome.Declined, "card_declined");
            case InsufficientFunds:
                return new ChargeResult(ChargeOutcome.Declined, "insufficient_funds");
            case Flaky when _flakyAttempts.AddOrUpdate(bookingId, 1, (_, tries) => tries + 1) <= FlakyFailures:
                return new ChargeResult(ChargeOutcome.Error);
            case Slow:
                await Task.Delay(slowCardDelay, cancellationToken);
                break;
        }
        return new ChargeResult(ChargeOutcome.Succeeded);
    }
}
