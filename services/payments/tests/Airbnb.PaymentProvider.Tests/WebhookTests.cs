using System.Net;
using System.Net.Http.Json;
using System.Text;
using static Airbnb.PaymentProvider.Tests.ProviderApp;

namespace Airbnb.PaymentProvider.Tests;

public sealed class WebhookTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Each_settled_charge_sends_one_signed_webhook()
    {
        await using var app = new ProviderApp();
        var reference = NewReference();

        using var _ = await app.Client().PostAsJsonAsync("/charges", Charge(reference, "4242424242424242"), Ct);

        var delivery = Assert.Single(await app.Inbox.WaitForAsync(reference, 1));
        await Task.Delay(300, Ct);
        Assert.Single(app.Inbox.For(reference));
        Assert.Equal(new Uri(ProviderApp.WebhookUrl), delivery.Url);
        Assert.StartsWith("evt_", delivery.EventId);
        Assert.Equal("charge.succeeded", delivery.Type);
        Assert.Equal(app.Clock.Now.ToUnixTimeSeconds(), delivery.Created);
        Assert.Equal("succeeded", delivery.Charge.GetProperty("status").GetString());
        Assert.True(Signature.Verifies(delivery.Signature, delivery.Body, ProviderApp.WebhookSecret, out var signedAt));
        Assert.Equal(app.Clock.Now.ToUnixTimeSeconds(), signedAt);
        var text = Encoding.UTF8.GetString(delivery.Body);
        Assert.DoesNotContain("4242424242424242", text);
        Assert.DoesNotContain("card", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("cvc", text, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Failed_deliveries_are_retried_until_delivered()
    {
        await using var app = new ProviderApp();
        var reference = NewReference();
        app.Inbox.FailFirst(2);
        // Each attempt moves the clock on 10 minutes, past a receiver's 5-minute tolerance: only a signature made
        // afresh for every attempt still verifies there.
        app.Inbox.OnDelivery = _ => app.Clock.Now += TimeSpan.FromMinutes(10);

        using var _ = await app.Client().PostAsJsonAsync("/charges", Charge(reference, "4242424242424242"), Ct);

        var attempts = await app.Inbox.WaitForAsync(reference, 3);
        Assert.Equal(
            [HttpStatusCode.InternalServerError, HttpStatusCode.InternalServerError, HttpStatusCode.OK],
            attempts.Select(a => a.Answer).ToArray());
        Assert.Single(attempts.Select(a => a.EventId).Distinct());
        var signedAt = attempts.Select(a =>
        {
            Assert.True(Signature.Verifies(a.Signature, a.Body, ProviderApp.WebhookSecret, out var t));
            return t;
        }).ToArray();
        Assert.True(signedAt[1] - signedAt[0] >= 600, $"{signedAt[0]} then {signedAt[1]}");
        Assert.True(signedAt[2] - signedAt[1] >= 600, $"{signedAt[1]} then {signedAt[2]}");
    }

    [Fact]
    public async Task Deliveries_stop_after_six_attempts()
    {
        await using var app = new ProviderApp(builder => builder.UseSetting("Provider:WebhookRetryDelay", "00:00:00.001"));
        var reference = NewReference();
        app.Inbox.FailFirst(100);

        using var _ = await app.Client().PostAsJsonAsync("/charges", Charge(reference, "4242424242424242"), Ct);

        await app.Inbox.WaitForAsync(reference, 6);
        // A seventh attempt would come about 3 s after the sixth.
        await Task.Delay(3500, Ct);
        Assert.Equal(6, app.Inbox.For(reference).Count);
    }

    [Fact]
    public async Task Resend_repeats_the_latest_event()
    {
        await using (var fresh = new ProviderApp())
        {
            using var none = await fresh.Client().PostAsync("/events/resend-latest", content: null, Ct);
            Assert.Equal(HttpStatusCode.NotFound, none.StatusCode);
        }
        await using var app = new ProviderApp();
        var reference = NewReference();
        using var _ = await app.Client().PostAsJsonAsync("/charges", Charge(reference, "4242424242424242"), Ct);
        var original = Assert.Single(await app.Inbox.WaitForAsync(reference, 1));

        using var resent = await app.Client().PostAsync("/events/resend-latest", content: null, Ct);

        Assert.Equal(HttpStatusCode.OK, resent.StatusCode);
        Assert.Equal(original.EventId, (await JsonAsync(resent)).GetProperty("id").GetString());
        var both = await app.Inbox.WaitForAsync(reference, 2);
        Assert.Equal([original.EventId, original.EventId], both.Select(d => d.EventId).ToArray());
    }
}
