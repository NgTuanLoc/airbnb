using Airbnb.Payments.Cards;

namespace Airbnb.Payments.Tests;

public sealed class FakeProcessorTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static ValidCard Card(string number) =>
        CardValidator.Validate(new CardInput(number, 12, 2030, "123"), new DateOnly(2026, 10, 28))!;

    private static FakeProcessor Processor() => new(slowCardDelay: TimeSpan.FromMilliseconds(200));

    [Theory]
    [InlineData("4242424242424242", ChargeOutcome.Succeeded, null)]
    [InlineData("5555555555554444", ChargeOutcome.Succeeded, null)]
    [InlineData("4000000000000002", ChargeOutcome.Declined, "card_declined")]
    [InlineData("4000000000009995", ChargeOutcome.Declined, "insufficient_funds")]
    public async Task Test_cards_decide_the_outcome(string number, ChargeOutcome outcome, string? reason)
    {
        var result = await Processor().ChargeAsync("bk_1", Card(number), 100m, Ct);

        Assert.Equal((outcome, reason), (result.Outcome, result.DeclineReason));
    }

    [Fact]
    public async Task The_flaky_card_errors_twice_per_booking_then_succeeds()
    {
        var processor = Processor();
        var card = Card("4000000000000119");

        Assert.Equal(ChargeOutcome.Error, (await processor.ChargeAsync("bk_1", card, 100m, Ct)).Outcome);
        Assert.Equal(ChargeOutcome.Error, (await processor.ChargeAsync("bk_1", card, 100m, Ct)).Outcome);
        Assert.Equal(ChargeOutcome.Succeeded, (await processor.ChargeAsync("bk_1", card, 100m, Ct)).Outcome);
        Assert.Equal(ChargeOutcome.Error, (await processor.ChargeAsync("bk_2", card, 100m, Ct)).Outcome);
    }

    [Fact]
    public async Task The_slow_card_takes_its_time_then_succeeds()
    {
        var started = DateTime.UtcNow;

        var result = await Processor().ChargeAsync("bk_1", Card("4000000000000077"), 100m, Ct);

        Assert.Equal(ChargeOutcome.Succeeded, result.Outcome);
        Assert.True(DateTime.UtcNow - started >= TimeSpan.FromMilliseconds(180));
    }
}
