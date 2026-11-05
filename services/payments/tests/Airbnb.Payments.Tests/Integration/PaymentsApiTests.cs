using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Npgsql;

namespace Airbnb.Payments.Tests.Integration;

public sealed class PaymentsApiTests(PaymentsFixture fixture)
{
    // A settled payment's event is on the exchange within moments; "only one" waits this long for a second.
    private static readonly TimeSpan EventWait = TimeSpan.FromSeconds(2);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string NewBookingId() => $"bk_{Guid.NewGuid():N}";

    private static object Charge(string bookingId, string number, decimal amount = 250m, int expYear = 2030, string cvc = "123") => new
    {
        bookingId,
        amount,
        card = new { number, expMonth = 12, expYear, cvc },
    };

    private async Task<HttpResponseMessage> PostAsync(object body, HttpClient? client = null) =>
        await (client ?? fixture.Client()).PostAsJsonAsync("/payments", body, Ct);

    private async Task<string?> StatusAsync(string bookingId)
    {
        using var response = await fixture.Client().GetAsync($"/payments/{bookingId}", Ct);
        return response.StatusCode == HttpStatusCode.NotFound
            ? null
            : (await PaymentsFixture.JsonAsync(response, Ct)).GetProperty("status").GetString();
    }

    private Task<PaymentEventsListener> ListenAsync() => PaymentEventsListener.StartAsync(fixture.MessagingConnectionString);

    [Fact]
    public async Task A_good_card_is_charged_and_announced()
    {
        await using var listener = await ListenAsync();
        var bookingId = NewBookingId();

        using var response = await PostAsync(Charge(bookingId, "4242 4242 4242 4242"));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await PaymentsFixture.JsonAsync(response, Ct);
        Assert.Equal(("succeeded", "visa", "4242"), (body.GetProperty("status").GetString(), body.GetProperty("brand").GetString(), body.GetProperty("last4").GetString()));
        Assert.Equal("succeeded", await StatusAsync(bookingId));
        Assert.Equal(1, fixture.Provider.ChargeRequests(bookingId));
        var (type, announced) = Assert.Single(await listener.EventsForAsync(bookingId, 2, EventWait));
        Assert.Equal("payment-succeeded", type);
        Assert.Equal(["bookingId"], announced.EnumerateObject().Select(p => p.Name).ToArray());
    }

    [Fact]
    public async Task Same_booking_charges_once()
    {
        var bookingId = NewBookingId();

        using var first = await PostAsync(Charge(bookingId, FakeProvider.Good));
        using var again = await PostAsync(Charge(bookingId, FakeProvider.Good));

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Created, again.StatusCode);
        Assert.Equal(1L, await CountAsync(bookingId));
        Assert.Equal(1, fixture.Provider.ChargeRequests(bookingId));
    }

    [Fact]
    public async Task Concurrent_charges_of_one_booking_charge_once()
    {
        var bookingId = NewBookingId();

        // The provider takes half a second to answer the first charge, so the second arrives while it's in flight.
        var responses = await Task.WhenAll(PostAsync(Charge(bookingId, FakeProvider.AnswersLate)), PostAsync(Charge(bookingId, FakeProvider.AnswersLate)));

        Assert.Contains(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.All(responses, r => Assert.True(r.StatusCode is HttpStatusCode.Created or HttpStatusCode.Accepted, r.StatusCode.ToString()));
        Assert.Equal(1L, await CountAsync(bookingId));
        Assert.Equal(1, fixture.Provider.ChargeRequests(bookingId));
        foreach (var response in responses) response.Dispose();
    }

    [Fact]
    public async Task A_charge_the_caller_gave_up_on_still_finishes()
    {
        var bookingId = NewBookingId();

        // The monolith times out an attempt and cancels it; the provider has the charge by then, so it must land.
        using var giveUp = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        giveUp.CancelAfter(TimeSpan.FromMilliseconds(200));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            fixture.Client().PostAsJsonAsync("/payments", Charge(bookingId, FakeProvider.AnswersLate), giveUp.Token));

        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(10);
        while (await StatusAsync(bookingId) != "succeeded" && DateTime.UtcNow < deadline)
        {
            await Task.Delay(200, Ct);
        }
        Assert.Equal("succeeded", await StatusAsync(bookingId));
    }

    [Fact]
    public async Task Different_amount_is_a_conflict()
    {
        var bookingId = NewBookingId();
        using var first = await PostAsync(Charge(bookingId, FakeProvider.Good, amount: 250m));

        using var changed = await PostAsync(Charge(bookingId, FakeProvider.Good, amount: 999m));

        Assert.Equal(HttpStatusCode.Conflict, changed.StatusCode);
        Assert.Equal("idempotency_conflict", (await PaymentsFixture.JsonAsync(changed, Ct)).GetProperty("code").GetString());
    }

    [Theory]
    [InlineData(FakeProvider.Declined, "card_declined")]
    [InlineData(FakeProvider.InsufficientFunds, "insufficient_funds")]
    public async Task Declined_cards_answer_402_and_are_announced(string number, string reason)
    {
        await using var listener = await ListenAsync();
        var bookingId = NewBookingId();

        using var response = await PostAsync(Charge(bookingId, number));

        Assert.Equal(HttpStatusCode.PaymentRequired, response.StatusCode);
        Assert.Equal(reason, (await PaymentsFixture.JsonAsync(response, Ct)).GetProperty("declineReason").GetString());
        Assert.Equal("declined", await StatusAsync(bookingId));
        var (type, announced) = Assert.Single(await listener.EventsForAsync(bookingId, 2, EventWait));
        Assert.Equal("payment-declined", type);
        Assert.Equal(reason, announced.GetProperty("declineReason").GetString());
    }

    [Fact]
    public async Task A_processing_charge_answers_202()
    {
        await using var listener = await ListenAsync();
        var bookingId = NewBookingId();

        using var response = await PostAsync(Charge(bookingId, FakeProvider.Slow));

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Equal("processing", (await PaymentsFixture.JsonAsync(response, Ct)).GetProperty("status").GetString());
        Assert.Empty(await listener.EventsForAsync(bookingId, 1, TimeSpan.FromSeconds(1)));
    }

    [Fact]
    public async Task A_webhook_that_lands_before_the_answer_still_gives_201_and_one_event()
    {
        await using var listener = await ListenAsync();
        var bookingId = NewBookingId();
        // The provider's webhook settles the payment while its answer to the charge is still on the way.
        fixture.Provider.BeforeAnswering(bookingId, async () =>
        {
            using var webhook = await Webhook.PostSignedAsync(fixture, Webhook.Event("charge.succeeded", bookingId, "succeeded"));
            Assert.Equal(HttpStatusCode.OK, webhook.StatusCode);
        });

        using var response = await PostAsync(Charge(bookingId, FakeProvider.Good));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("payment-succeeded", Assert.Single(await listener.EventsForAsync(bookingId, 2, EventWait)).Type);
    }

    [Fact]
    public async Task The_flaky_card_is_retried_with_the_same_reference()
    {
        var bookingId = NewBookingId();

        using var response = await PostAsync(Charge(bookingId, FakeProvider.Flaky));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(3, fixture.Provider.ChargeRequests(bookingId));
        Assert.Equal(1L, await CountAsync(bookingId));
    }

    [Fact]
    public async Task No_answer_leaves_it_processing()
    {
        var bookingId = NewBookingId();

        using var response = await PostAsync(Charge(bookingId, FakeProvider.NeverAnswers));

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Equal("processing", await StatusAsync(bookingId));
        Assert.Equal(3, fixture.Provider.ChargeRequests(bookingId));
    }

    [Fact]
    public async Task A_refused_charge_is_503_and_released()
    {
        var bookingId = NewBookingId();

        using var response = await PostAsync(Charge(bookingId, FakeProvider.Refused));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("processor_error", (await PaymentsFixture.JsonAsync(response, Ct)).GetProperty("code").GetString());
        Assert.Null(await StatusAsync(bookingId));
    }

    [Fact]
    public async Task Invalid_card_answers_400_and_stores_nothing()
    {
        var bookingId = NewBookingId();

        using var response = await PostAsync(Charge(bookingId, "4242424242424241"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_card", (await PaymentsFixture.JsonAsync(response, Ct)).GetProperty("code").GetString());
        Assert.Null(await StatusAsync(bookingId));
        Assert.Equal(0, fixture.Provider.ChargeRequests(bookingId));
    }

    [Fact]
    public async Task Void_is_idempotent()
    {
        var bookingId = NewBookingId();
        using var charged = await PostAsync(Charge(bookingId, FakeProvider.Good));

        using var first = await fixture.Client().PostAsync($"/payments/{bookingId}/void", content: null, Ct);
        using var second = await fixture.Client().PostAsync($"/payments/{bookingId}/void", content: null, Ct);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal("voided", await StatusAsync(bookingId));
    }

    [Fact]
    public async Task A_void_before_any_charge_blocks_a_later_one()
    {
        var bookingId = NewBookingId();

        // The guest cancelled while the monolith was between charge attempts: the void comes first.
        using var voided = await fixture.Client().PostAsync($"/payments/{bookingId}/void", content: null, Ct);
        using var late = await PostAsync(Charge(bookingId, FakeProvider.Good));

        Assert.Equal(HttpStatusCode.OK, voided.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, late.StatusCode);
        Assert.Equal("payment_voided", (await PaymentsFixture.JsonAsync(late, Ct)).GetProperty("code").GetString());
        Assert.Equal("voided", await StatusAsync(bookingId));
        Assert.Equal(0, fixture.Provider.ChargeRequests(bookingId));
    }

    [Fact]
    public async Task Booking_cancelled_refunds_once()
    {
        var bookingId = NewBookingId();
        using var charged = await PostAsync(Charge(bookingId, FakeProvider.Good));
        var cancelled = new
        {
            bookingId,
            listingId = "l7",
            listingTitle = "Seaside villa",
            guestName = "Ana",
            guestEmail = "ana@example.com",
            checkIn = "2027-03-03",
            checkOut = "2027-03-06",
            cancelledAt = "2026-10-29T09:00:00+00:00",
        };

        await fixture.PublishAsync("booking-cancelled", cancelled, Ct);
        await fixture.PublishAsync("booking-cancelled", cancelled, Ct);

        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(20);
        while (await StatusAsync(bookingId) != "refunded" && DateTime.UtcNow < deadline)
        {
            await Task.Delay(200, Ct);
        }
        Assert.Equal("refunded", await StatusAsync(bookingId));
    }

    [Fact]
    public async Task Requests_need_the_service_key()
    {
        using var anonymous = fixture.Service.CreateClient();
        using var wrong = fixture.Service.CreateClient();
        wrong.DefaultRequestHeaders.Add("X-Service-Key", "not-the-key");

        using var none = await PostAsync(Charge(NewBookingId(), FakeProvider.Good), anonymous);
        using var bad = await PostAsync(Charge(NewBookingId(), FakeProvider.Good), wrong);
        using var read = await anonymous.GetAsync($"/payments/{NewBookingId()}", Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, none.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, bad.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, read.StatusCode);
    }

    [Theory]
    [InlineData("Payments:ProviderKey")]
    [InlineData("Payments:WebhookSecret")]
    public async Task Missing_provider_settings_fail_at_startup(string setting)
    {
        await using var factory = fixture.Service.WithWebHostBuilder(builder => builder.UseSetting(setting, ""));

        Assert.ThrowsAny<Exception>(() => factory.CreateClient());
    }

    [Fact]
    public async Task Card_number_is_never_stored()
    {
        var bookingId = NewBookingId();
        using var charged = await PostAsync(Charge(bookingId, FakeProvider.Good, cvc: "987"));

        await using var connection = new NpgsqlConnection(fixture.PostgresConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand("SELECT row_to_json(p)::text FROM payments p WHERE \"BookingId\" = @id", connection);
        command.Parameters.AddWithValue("id", bookingId);
        var row = (string)(await command.ExecuteScalarAsync(Ct))!;

        Assert.DoesNotContain("4242424242424242", row);
        Assert.DoesNotContain("424242424242", row);
        Assert.DoesNotContain("987", row);
    }

    private async Task<long> CountAsync(string bookingId)
    {
        await using var connection = new NpgsqlConnection(fixture.PostgresConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand("SELECT count(*) FROM payments WHERE \"BookingId\" = @id", connection);
        command.Parameters.AddWithValue("id", bookingId);
        return (long)(await command.ExecuteScalarAsync(Ct))!;
    }
}
