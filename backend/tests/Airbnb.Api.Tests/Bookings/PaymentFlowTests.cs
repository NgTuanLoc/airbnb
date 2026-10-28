using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using static Airbnb.Api.Tests.Bookings.BookingRequests;

namespace Airbnb.Api.Tests.Bookings;

// Booking and payment agreeing without a shared transaction: charge, hold, reconcile, compensate.
// The only tests that leave bookings pending (and run the reconciler), so they share nothing with the other classes.
public sealed class PaymentFlowTests(InfrastructureFixture infrastructure)
{
    private static readonly TimeSpan SettleTimeout = TimeSpan.FromSeconds(15);

    private readonly FakePaymentService _payments = new();
    private readonly MutableTimeProvider _clock = new(DateTimeOffset.UtcNow);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private WebApplicationFactory<Program> Factory(bool reconcile = false) =>
        BookingRequests.Factory(infrastructure, payments: _payments).WithWebHostBuilder(builder =>
        {
            builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(_clock));
            if (reconcile)
            {
                builder.UseSetting("Bookings:Payments:ReconcilerEnabled", "true")
                    .UseSetting("Bookings:Payments:ReconcileInterval", "00:00:00.2");
            }
        });

    private static async Task<JsonElement> BodyAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(Ct);

    private static async Task<string> IdAsync(HttpResponseMessage response) =>
        (await BodyAsync(response)).GetProperty("data").GetProperty("id").GetString()!;

    private static async Task<string> StatusAsync(HttpClient client, string token, string id)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"/api/bookings/{id}").Authorized(token);
        using var response = await client.SendAsync(request, Ct);
        return (await BodyAsync(response)).GetProperty("data").GetProperty("status").GetString()!;
    }

    private static async Task<string> WaitForStatusAsync(HttpClient client, string token, string id, string expected)
    {
        var deadline = DateTime.UtcNow + SettleTimeout;
        string status;
        while ((status = await StatusAsync(client, token, id)) != expected && DateTime.UtcNow < deadline)
        {
            await Task.Delay(100, Ct);
        }
        return status;
    }

    private static async Task<string> PendingAsync(HttpClient client, string token, string listingId = "l13")
    {
        using var response = await BookAsync(client, token, Stay(listingId, RandomMonth(), 2, card: FakePaymentService.Unanswered));
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        return await IdAsync(response);
    }

    [Fact]
    public async Task Successful_payment_confirms_and_publishes()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        await using var listener = await BookingEventsTests.Listener.StartAsync(infrastructure.MessagingConnectionString);
        var guest = await AuthHelpers.RegisterAsync(client);

        using var response = await BookAsync(client, guest.Token, Stay("l13", RandomMonth(), 2));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var id = await IdAsync(response);
        Assert.Equal("confirmed", await StatusAsync(client, guest.Token, id));
        Assert.Equal("succeeded", _payments.StatusOf(id));
        Assert.Equal("booking-confirmed", Assert.Single(await listener.EventsForAsync(id, 1)).Type);
    }

    [Theory]
    [InlineData(FakePaymentService.Declined, "card_declined", "Your card was declined")]
    [InlineData(FakePaymentService.InsufficientFunds, "insufficient_funds", "Your card has insufficient funds")]
    public async Task Declined_payment_frees_the_nights(string card, string code, string message)
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var guest = await AuthHelpers.RegisterAsync(client);
        var other = await AuthHelpers.RegisterAsync(client);
        var month = RandomMonth();

        using var declined = await BookAsync(client, guest.Token, Stay("l14", month, 3, card: card));
        using var retaken = await BookAsync(client, other.Token, Stay("l14", month, 3));

        Assert.Equal(HttpStatusCode.PaymentRequired, declined.StatusCode);
        var body = await BodyAsync(declined);
        Assert.Equal((code, message), (body.GetProperty("code").GetString(), body.GetProperty("error").GetString()));
        Assert.Equal(HttpStatusCode.Created, retaken.StatusCode);
    }

    [Fact]
    public async Task Invalid_card_is_400()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var guest = await AuthHelpers.RegisterAsync(client);
        var month = RandomMonth();

        using var invalid = await BookAsync(client, guest.Token, Stay("l15", month, 2, card: FakePaymentService.Invalid));
        using var fixedCard = await BookAsync(client, guest.Token, Stay("l15", month, 2));

        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Equal("invalid_card", (await BodyAsync(invalid)).GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.Created, fixedCard.StatusCode);
    }

    [Fact]
    public async Task Pending_booking_holds_the_nights()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var guest = await AuthHelpers.RegisterAsync(client);
        var other = await AuthHelpers.RegisterAsync(client);
        var month = RandomMonth();

        using var pending = await BookAsync(client, guest.Token, Stay("l16", month, 3, card: FakePaymentService.Unanswered));
        using var refused = await BookAsync(client, other.Token, Stay("l16", month.AddDays(1), 3));

        Assert.Equal(HttpStatusCode.Accepted, pending.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
    }

    [Fact]
    public async Task Retries_after_a_timeout_charge_once()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var guest = await AuthHelpers.RegisterAsync(client);

        using var response = await BookAsync(client, guest.Token, Stay("l13", RandomMonth(), 2, card: FakePaymentService.TimesOutOnce));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var id = await IdAsync(response);
        Assert.Equal(2, _payments.AttemptsFor(id));
        Assert.Equal("succeeded", _payments.StatusOf(id));
    }

    [Fact]
    public async Task Unanswered_payment_is_202_pending()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var guest = await AuthHelpers.RegisterAsync(client);

        var id = await PendingAsync(client, guest.Token);

        Assert.Equal("pending", await StatusAsync(client, guest.Token, id));
        Assert.Equal(3, _payments.AttemptsFor(id));
    }

    [Fact]
    public async Task Late_success_is_confirmed_by_the_reconciler()
    {
        await using var factory = Factory(reconcile: true);
        using var client = factory.CreateClient();
        await using var listener = await BookingEventsTests.Listener.StartAsync(infrastructure.MessagingConnectionString);
        var guest = await AuthHelpers.RegisterAsync(client);
        var id = await PendingAsync(client, guest.Token);

        _payments.Settle(id, "succeeded");

        Assert.Equal("confirmed", await WaitForStatusAsync(client, guest.Token, id, "confirmed"));
        Assert.Equal("booking-confirmed", Assert.Single(await listener.EventsForAsync(id, 1)).Type);
    }

    [Fact]
    public async Task Unknown_payment_is_declined_after_2_minutes()
    {
        await using var factory = Factory(reconcile: true);
        using var client = factory.CreateClient();
        var guest = await AuthHelpers.RegisterAsync(client);
        var id = await PendingAsync(client, guest.Token);

        await Task.Delay(1000, Ct);
        Assert.Equal("pending", await StatusAsync(client, guest.Token, id));
        _clock.Now += TimeSpan.FromMinutes(3);

        Assert.Equal("declined", await WaitForStatusAsync(client, guest.Token, id, "declined"));
    }

    [Fact]
    public async Task Stuck_payment_is_declined_and_voided_after_15_minutes()
    {
        await using var factory = Factory(reconcile: true);
        using var client = factory.CreateClient();
        var guest = await AuthHelpers.RegisterAsync(client);
        var id = await PendingAsync(client, guest.Token);
        _payments.Settle(id, "processing");

        _clock.Now += TimeSpan.FromMinutes(5);
        await Task.Delay(1000, Ct);
        Assert.Equal("pending", await StatusAsync(client, guest.Token, id));
        _clock.Now += TimeSpan.FromMinutes(11);

        Assert.Equal("declined", await WaitForStatusAsync(client, guest.Token, id, "declined"));
        Assert.Equal("voided", _payments.StatusOf(id));
    }

    [Fact]
    public async Task Cancelling_pending_voids()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var guest = await AuthHelpers.RegisterAsync(client);
        var id = await PendingAsync(client, guest.Token);

        using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/bookings/{id}/cancel").Authorized(guest.Token);
        using var cancelled = await client.SendAsync(request, Ct);

        Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
        Assert.Equal("cancelled", await StatusAsync(client, guest.Token, id));
        Assert.True(_payments.WasVoided(id));
    }
}
