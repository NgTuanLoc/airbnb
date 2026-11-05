using System.Net;
using System.Net.Http.Json;
using System.Text;
using static Airbnb.PaymentProvider.Tests.ProviderApp;

namespace Airbnb.PaymentProvider.Tests;

public sealed class ChargeTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("4242424242424242", "succeeded", null)]
    [InlineData("5555555555554444", "succeeded", null)]
    [InlineData("4000000000000002", "declined", "card_declined")]
    [InlineData("4000 0000 0000 0002", "declined", "card_declined")]
    [InlineData("4000000000009995", "declined", "insufficient_funds")]
    public async Task Test_cards_decide_the_charge(string number, string status, string? reason)
    {
        await using var app = new ProviderApp();
        var reference = NewReference();

        using var response = await app.Client().PostAsJsonAsync("/charges", Charge(reference, number), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var charge = await JsonAsync(response);
        Assert.StartsWith("ch_", charge.GetProperty("id").GetString());
        Assert.Equal(reference, charge.GetProperty("reference").GetString());
        Assert.Equal(250m, charge.GetProperty("amount").GetDecimal());
        Assert.Equal("USD", charge.GetProperty("currency").GetString());
        Assert.Equal((status, reason), (charge.GetProperty("status").GetString(), charge.GetProperty("declineReason").GetString()));
    }

    [Fact]
    public async Task The_same_reference_returns_the_same_charge()
    {
        await using var app = new ProviderApp();
        var reference = NewReference();

        using var first = await app.Client().PostAsJsonAsync("/charges", Charge(reference, "4242424242424242"), Ct);
        using var again = await app.Client().PostAsJsonAsync("/charges", Charge(reference, "4242424242424242"), Ct);

        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal((await JsonAsync(first)).GetProperty("id").GetString(), (await JsonAsync(again)).GetProperty("id").GetString());
        await app.Inbox.WaitForAsync(reference, 1);
        await Task.Delay(300, Ct);
        Assert.Single(app.Inbox.For(reference));
    }

    [Fact]
    public async Task A_different_amount_is_409()
    {
        await using var app = new ProviderApp();
        var reference = NewReference();
        using var first = await app.Client().PostAsJsonAsync("/charges", Charge(reference, "4242424242424242", amount: 250m), Ct);

        using var changed = await app.Client().PostAsJsonAsync("/charges", Charge(reference, "4242424242424242", amount: 999m), Ct);

        Assert.Equal(HttpStatusCode.Conflict, changed.StatusCode);
        Assert.Equal("idempotency_conflict", (await JsonAsync(changed)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task The_flaky_card_fails_twice_then_succeeds()
    {
        await using var app = new ProviderApp();
        var reference = NewReference();
        var client = app.Client();

        using var first = await client.PostAsJsonAsync("/charges", Charge(reference, "4000000000000119"), Ct);
        using var nothingRecorded = await client.GetAsync($"/charges/{reference}", Ct);
        using var second = await client.PostAsJsonAsync("/charges", Charge(reference, "4000000000000119"), Ct);
        using var third = await client.PostAsJsonAsync("/charges", Charge(reference, "4000000000000119"), Ct);

        Assert.Equal(HttpStatusCode.InternalServerError, first.StatusCode);
        Assert.Equal("processing_error", (await JsonAsync(first)).GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.NotFound, nothingRecorded.StatusCode);
        Assert.Equal(HttpStatusCode.InternalServerError, second.StatusCode);
        Assert.Equal(HttpStatusCode.OK, third.StatusCode);
        Assert.Equal("succeeded", (await JsonAsync(third)).GetProperty("status").GetString());
    }

    [Fact]
    public async Task The_slow_card_is_processing_then_succeeds_by_webhook()
    {
        await using var app = new ProviderApp();
        var reference = NewReference();
        var client = app.Client();

        using var response = await client.PostAsJsonAsync("/charges", Charge(reference, "4000000000000077"), Ct);

        Assert.Equal("processing", (await JsonAsync(response)).GetProperty("status").GetString());
        Assert.Empty(app.Inbox.For(reference));
        var delivery = Assert.Single(await app.Inbox.WaitForAsync(reference, 1));
        Assert.Equal("charge.succeeded", delivery.Type);
        using var settled = await client.GetAsync($"/charges/{reference}", Ct);
        Assert.Equal("succeeded", (await JsonAsync(settled)).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Refund_rules()
    {
        await using var app = new ProviderApp();
        var client = app.Client();
        var paid = NewReference();
        var slow = NewReference();
        var declined = NewReference();
        using var _ = await client.PostAsJsonAsync("/charges", Charge(paid, "4242424242424242"), Ct);
        using var __ = await client.PostAsJsonAsync("/charges", Charge(slow, "4000000000000077"), Ct);
        using var ___ = await client.PostAsJsonAsync("/charges", Charge(declined, "4000000000000002"), Ct);

        using var refunded = await client.PostAsync($"/charges/{paid}/refund", content: null, Ct);
        using var again = await client.PostAsync($"/charges/{paid}/refund", content: null, Ct);
        using var processing = await client.PostAsync($"/charges/{slow}/refund", content: null, Ct);
        using var nothingTaken = await client.PostAsync($"/charges/{declined}/refund", content: null, Ct);
        using var unknown = await client.PostAsync($"/charges/{NewReference()}/refund", content: null, Ct);

        Assert.Equal((HttpStatusCode.OK, "refunded"), (refunded.StatusCode, (await JsonAsync(refunded)).GetProperty("status").GetString()));
        Assert.Equal((HttpStatusCode.OK, "refunded"), (again.StatusCode, (await JsonAsync(again)).GetProperty("status").GetString()));
        Assert.Equal((HttpStatusCode.Conflict, "charge_processing"), (processing.StatusCode, (await JsonAsync(processing)).GetProperty("code").GetString()));
        Assert.Equal((HttpStatusCode.OK, "declined"), (nothingTaken.StatusCode, (await JsonAsync(nothingTaken)).GetProperty("status").GetString()));
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        await app.Inbox.WaitForAsync(paid, 2);
        await Task.Delay(300, Ct);
        // Deliveries run concurrently, so they may arrive in either order.
        Assert.Equal(["charge.refunded", "charge.succeeded"], app.Inbox.For(paid).Select(d => d.Type).Order().ToArray());
    }

    [Fact]
    public async Task Disputes_mark_only_succeeded_charges()
    {
        await using var app = new ProviderApp();
        var client = app.Client();
        var paid = NewReference();
        var declined = NewReference();
        using var _ = await client.PostAsJsonAsync("/charges", Charge(paid, "4242424242424242"), Ct);
        using var __ = await client.PostAsJsonAsync("/charges", Charge(declined, "4000000000000002"), Ct);

        using var disputed = await client.PostAsJsonAsync("/disputes", new { reference = paid }, Ct);
        using var notTaken = await client.PostAsJsonAsync("/disputes", new { reference = declined }, Ct);
        using var unknown = await client.PostAsJsonAsync("/disputes", new { reference = NewReference() }, Ct);

        Assert.Equal((HttpStatusCode.OK, "disputed"), (disputed.StatusCode, (await JsonAsync(disputed)).GetProperty("status").GetString()));
        Assert.Equal(HttpStatusCode.Conflict, notTaken.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Contains(await app.Inbox.WaitForAsync(paid, 2), d => d.Type == "charge.dispute.created");
    }

    [Fact]
    public async Task Requests_need_the_api_key()
    {
        await using var app = new ProviderApp();
        var reference = NewReference();

        foreach (var client in new[] { app.Client(apiKey: null), app.Client("not-the-key") })
        {
            using var charge = await client.PostAsJsonAsync("/charges", Charge(reference, "4242424242424242"), Ct);
            using var read = await client.GetAsync($"/charges/{reference}", Ct);
            using var refund = await client.PostAsync($"/charges/{reference}/refund", content: null, Ct);
            using var dispute = await client.PostAsJsonAsync("/disputes", new { reference }, Ct);
            using var resend = await client.PostAsync("/events/resend-latest", content: null, Ct);

            Assert.All(new[] { charge, read, refund, dispute, resend }, r => Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode));
        }
        using var health = await app.Client(apiKey: null).GetAsync("/health", Ct);
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        Assert.Empty(app.Inbox.For(reference));
    }

    [Theory]
    [InlineData("""{"amount":250,"currency":"USD","card":{"number":"4242424242424242"}}""")]
    [InlineData("""{"reference":"bk_12345678901234567890123456789012345678","amount":250,"currency":"USD","card":{"number":"4242424242424242"}}""")]
    [InlineData("""{"reference":"bk_1","amount":0,"currency":"USD","card":{"number":"4242424242424242"}}""")]
    [InlineData("""{"reference":"bk_1","amount":250,"currency":"USD"}""")]
    [InlineData("""{"reference":"bk_1","amount":250,"currency":"USD","card":{"number":null}}""")]
    public async Task Bad_charge_requests_are_400(string body)
    {
        await using var app = new ProviderApp();

        using var response = await app.Client().PostAsync("/charges", new StringContent(body, Encoding.UTF8, "application/json"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_request", (await JsonAsync(response)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Missing_settings_fail_at_startup()
    {
        await using var app = new ProviderApp(builder => builder.UseSetting("Provider:WebhookSecret", ""));

        Assert.ThrowsAny<Exception>(() => app.Client());
    }
}
