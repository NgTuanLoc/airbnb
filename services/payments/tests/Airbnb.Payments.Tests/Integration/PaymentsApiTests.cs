using System.Net;
using System.Net.Http.Json;
using Npgsql;

namespace Airbnb.Payments.Tests.Integration;

public sealed class PaymentsApiTests(PaymentsFixture fixture)
{
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

    [Fact]
    public async Task A_good_card_is_charged_and_only_brand_and_last_four_come_back()
    {
        var bookingId = NewBookingId();

        using var response = await PostAsync(Charge(bookingId, "4242 4242 4242 4242"));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await PaymentsFixture.JsonAsync(response, Ct);
        Assert.Equal(("succeeded", "visa", "4242"), (body.GetProperty("status").GetString(), body.GetProperty("brand").GetString(), body.GetProperty("last4").GetString()));
        Assert.Equal("succeeded", await StatusAsync(bookingId));
    }

    [Fact]
    public async Task Same_booking_charges_once()
    {
        var bookingId = NewBookingId();

        using var first = await PostAsync(Charge(bookingId, "4242424242424242"));
        using var again = await PostAsync(Charge(bookingId, "4242424242424242"));

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Created, again.StatusCode);
        Assert.Equal(1L, await CountAsync(bookingId));
    }

    [Fact]
    public async Task Concurrent_charges_of_one_booking_charge_once()
    {
        var bookingId = NewBookingId();

        // The slow card keeps the first charge in flight while the second arrives.
        var responses = await Task.WhenAll(PostAsync(Charge(bookingId, "4000000000000077")), PostAsync(Charge(bookingId, "4000000000000077")));

        Assert.Contains(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Contains(responses, r => r.StatusCode is HttpStatusCode.Created or HttpStatusCode.Conflict);
        Assert.Equal(1L, await CountAsync(bookingId));
        foreach (var response in responses) response.Dispose();
    }

    [Fact]
    public async Task A_charge_the_caller_gave_up_on_still_finishes()
    {
        var bookingId = NewBookingId();

        // The monolith times out an attempt and cancels it; the processor has the charge by then, so it must land.
        using var giveUp = CancellationTokenSource.CreateLinkedTokenSource(Ct);
        giveUp.CancelAfter(TimeSpan.FromMilliseconds(300));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            fixture.Client().PostAsJsonAsync("/payments", Charge(bookingId, "4000000000000077"), giveUp.Token));

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
        using var first = await PostAsync(Charge(bookingId, "4242424242424242", amount: 250m));

        using var changed = await PostAsync(Charge(bookingId, "4242424242424242", amount: 999m));

        Assert.Equal(HttpStatusCode.Conflict, changed.StatusCode);
        Assert.Equal("idempotency_conflict", (await PaymentsFixture.JsonAsync(changed, Ct)).GetProperty("code").GetString());
    }

    [Theory]
    [InlineData("4000000000000002", "card_declined")]
    [InlineData("4000000000009995", "insufficient_funds")]
    public async Task Declined_cards_answer_402(string number, string reason)
    {
        var bookingId = NewBookingId();

        using var response = await PostAsync(Charge(bookingId, number));

        Assert.Equal(HttpStatusCode.PaymentRequired, response.StatusCode);
        Assert.Equal(reason, (await PaymentsFixture.JsonAsync(response, Ct)).GetProperty("declineReason").GetString());
        Assert.Equal("declined", await StatusAsync(bookingId));
    }

    [Fact]
    public async Task Invalid_card_answers_400_and_stores_nothing()
    {
        var bookingId = NewBookingId();

        using var response = await PostAsync(Charge(bookingId, "4242424242424241"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_card", (await PaymentsFixture.JsonAsync(response, Ct)).GetProperty("code").GetString());
        Assert.Null(await StatusAsync(bookingId));
    }

    [Fact]
    public async Task Processor_error_answers_503_then_succeeds()
    {
        var bookingId = NewBookingId();

        using var first = await PostAsync(Charge(bookingId, "4000000000000119"));
        using var second = await PostAsync(Charge(bookingId, "4000000000000119"));
        using var third = await PostAsync(Charge(bookingId, "4000000000000119"));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, first.StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, second.StatusCode);
        Assert.Equal(HttpStatusCode.Created, third.StatusCode);
        Assert.Equal(1L, await CountAsync(bookingId));
    }

    [Fact]
    public async Task Void_is_idempotent()
    {
        var bookingId = NewBookingId();
        using var charged = await PostAsync(Charge(bookingId, "4242424242424242"));

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
        using var late = await PostAsync(Charge(bookingId, "4242424242424242"));

        Assert.Equal(HttpStatusCode.OK, voided.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, late.StatusCode);
        Assert.Equal("payment_voided", (await PaymentsFixture.JsonAsync(late, Ct)).GetProperty("code").GetString());
        Assert.Equal("voided", await StatusAsync(bookingId));
    }

    [Fact]
    public async Task Booking_cancelled_refunds_once()
    {
        var bookingId = NewBookingId();
        using var charged = await PostAsync(Charge(bookingId, "4242424242424242"));
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

        using var none = await PostAsync(Charge(NewBookingId(), "4242424242424242"), anonymous);
        using var bad = await PostAsync(Charge(NewBookingId(), "4242424242424242"), wrong);
        using var read = await anonymous.GetAsync($"/payments/{NewBookingId()}", Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, none.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, bad.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, read.StatusCode);
    }

    [Fact]
    public async Task Card_number_is_never_stored()
    {
        var bookingId = NewBookingId();
        using var charged = await PostAsync(Charge(bookingId, "4242424242424242", cvc: "987"));

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
