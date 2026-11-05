using System.IO.Pipelines;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using Npgsql;

namespace Airbnb.Payments.Tests.Integration;

// The provider's webhooks as it sends them: POST /webhooks/provider with a signature and no service key.
public sealed class WebhookTests(PaymentsFixture fixture)
{
    // A settled payment's event is on the exchange within moments; "only one" waits this long for a second.
    private static readonly TimeSpan EventWait = TimeSpan.FromSeconds(2);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string NewBookingId() => $"bk_{Guid.NewGuid():N}";

    private async Task<string> PaymentAsync(string number, HttpStatusCode expected)
    {
        var bookingId = NewBookingId();
        using var client = fixture.Client();
        using var response = await client.PostAsJsonAsync("/payments",
            new { bookingId, amount = 250m, card = new { number, expMonth = 12, expYear = 2030, cvc = "123" } }, Ct);
        Assert.Equal(expected, response.StatusCode);
        return bookingId;
    }

    private Task<string> ProcessingPaymentAsync() => PaymentAsync(FakeProvider.Slow, HttpStatusCode.Accepted);

    private Task<string> SucceededPaymentAsync() => PaymentAsync(FakeProvider.Good, HttpStatusCode.Created);

    private async Task<(string? Status, string? DeclineReason)> PaymentOfAsync(string bookingId)
    {
        using var client = fixture.Client();
        var payment = await client.GetFromJsonAsync<System.Text.Json.JsonElement>($"/payments/{bookingId}", Ct);
        return (payment.GetProperty("status").GetString(), payment.GetProperty("declineReason").GetString());
    }

    private Task<PaymentEventsListener> ListenAsync() => PaymentEventsListener.StartAsync(fixture.MessagingConnectionString);

    private static async Task<string?> CodeAsync(HttpResponseMessage response) =>
        (await PaymentsFixture.JsonAsync(response, Ct)).GetProperty("code").GetString();

    [Fact]
    public async Task A_signed_success_settles_a_processing_payment_once()
    {
        await using var listener = await ListenAsync();
        var bookingId = await ProcessingPaymentAsync();
        var eventId = Webhook.NewEventId();
        var body = Webhook.Event("charge.succeeded", bookingId, "succeeded", id: eventId);

        using var first = await Webhook.PostSignedAsync(fixture, body);
        using var again = await Webhook.PostSignedAsync(fixture, body);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal("succeeded", (await PaymentOfAsync(bookingId)).Status);
        Assert.Equal("payment-succeeded", Assert.Single(await listener.EventsForAsync(bookingId, 2, EventWait)).Type);
        Assert.Equal(1L, await RecordedEventsAsync(eventId));
    }

    [Fact]
    public async Task A_failure_event_declines_with_its_reason()
    {
        await using var listener = await ListenAsync();
        var bookingId = await ProcessingPaymentAsync();

        using var response = await Webhook.PostSignedAsync(fixture, Webhook.Event("charge.failed", bookingId, "declined", "insufficient_funds"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(("declined", "insufficient_funds"), await PaymentOfAsync(bookingId));
        var (type, announced) = Assert.Single(await listener.EventsForAsync(bookingId, 2, EventWait));
        Assert.Equal("payment-declined", type);
        Assert.Equal("insufficient_funds", announced.GetProperty("declineReason").GetString());
    }

    [Fact]
    public async Task Refund_and_dispute_events_move_a_succeeded_payment()
    {
        var refunded = await SucceededPaymentAsync();
        var disputed = await SucceededPaymentAsync();

        using var refund = await Webhook.PostSignedAsync(fixture, Webhook.Event("charge.refunded", refunded, "refunded"));
        using var dispute = await Webhook.PostSignedAsync(fixture, Webhook.Event("charge.dispute.created", disputed, "disputed"));

        Assert.Equal((HttpStatusCode.OK, HttpStatusCode.OK), (refund.StatusCode, dispute.StatusCode));
        Assert.Equal("refunded", (await PaymentOfAsync(refunded)).Status);
        Assert.Equal("disputed", (await PaymentOfAsync(disputed)).Status);
    }

    [Fact]
    public async Task Late_or_out_of_order_events_change_nothing()
    {
        await using var listener = await ListenAsync();
        var succeeded = await SucceededPaymentAsync();
        var processing = await ProcessingPaymentAsync();

        using var lateFailure = await Webhook.PostSignedAsync(fixture, Webhook.Event("charge.failed", succeeded, "declined", "card_declined"));
        using var earlyRefund = await Webhook.PostSignedAsync(fixture, Webhook.Event("charge.refunded", processing, "refunded"));

        Assert.Equal((HttpStatusCode.OK, HttpStatusCode.OK), (lateFailure.StatusCode, earlyRefund.StatusCode));
        Assert.Equal("succeeded", (await PaymentOfAsync(succeeded)).Status);
        Assert.Equal("processing", (await PaymentOfAsync(processing)).Status);
        // Only the charge's own announcement.
        Assert.Equal(["payment-succeeded"], (await listener.EventsForAsync(succeeded, 2, EventWait)).Select(e => e.Type).ToArray());
    }

    [Fact]
    public async Task Unsigned_tampered_or_stale_webhooks_are_400()
    {
        var bookingId = await ProcessingPaymentAsync();
        var body = Webhook.Event("charge.succeeded", bookingId, "succeeded");
        var bytes = Encoding.UTF8.GetBytes(body);
        var tampered = Encoding.UTF8.GetBytes(body.Replace("\"amount\":250", "\"amount\":1"));

        using var unsigned = await Webhook.PostAsync(fixture, new ByteArrayContent(bytes), signature: null);
        using var otherSecret = await Webhook.PostAsync(fixture, new ByteArrayContent(bytes), Webhook.Sign(bytes, "whsec_not_ours", DateTimeOffset.UtcNow));
        using var changed = await Webhook.PostAsync(fixture, new ByteArrayContent(tampered), Webhook.Sign(bytes, PaymentsFixture.WebhookSecret, DateTimeOffset.UtcNow));
        using var stale = await Webhook.PostAsync(fixture, new ByteArrayContent(bytes), Webhook.Sign(bytes, PaymentsFixture.WebhookSecret, DateTimeOffset.UtcNow.AddMinutes(-6)));

        foreach (var response in new[] { unsigned, otherSecret, changed, stale })
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal("invalid_signature", await CodeAsync(response));
        }
        Assert.Equal("processing", (await PaymentOfAsync(bookingId)).Status);
    }

    [Fact]
    public async Task A_body_with_unusual_formatting_still_verifies()
    {
        var bookingId = await ProcessingPaymentAsync();
        // Keys out of the usual order, odd spacing and line breaks: the signature covers these exact bytes.
        var body = $$"""
            {
              "data" :  { "object" : { "status":"succeeded" , "declineReason" : null,
                "reference" : "{{bookingId}}", "amount": 250.00, "currency":"USD", "id":"ch_x" } },
              "created": 1793880000,     "type" : "charge.succeeded",
              "id" : "{{Webhook.NewEventId()}}"
            }
            """;

        using var response = await Webhook.PostSignedAsync(fixture, body);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("succeeded", (await PaymentOfAsync(bookingId)).Status);
    }

    [Fact]
    public async Task Oversized_webhooks_are_413_even_when_chunked()
    {
        var bookingId = await ProcessingPaymentAsync();
        var body = Webhook.Event("charge.succeeded", bookingId, "succeeded").Replace("\"type\"", $"\"padding\":\"{new string('x', 65 * 1024)}\",\"type\"");
        var bytes = Encoding.UTF8.GetBytes(body);
        var signature = Webhook.Sign(bytes, PaymentsFixture.WebhookSecret, DateTimeOffset.UtcNow);
        // A pipe's stream can't seek, so the request carries no Content-Length. It never pauses its writer: by default
        // it would wait at 64 KB for a reader that only comes once the request is sent.
        var pipe = new Pipe(new PipeOptions(pauseWriterThreshold: 0, resumeWriterThreshold: 0));
        await pipe.Writer.WriteAsync(bytes, Ct);
        await pipe.Writer.CompleteAsync();
        var streamed = new StreamContent(pipe.Reader.AsStream());
        Assert.Null(streamed.Headers.ContentLength);

        using var sized = await Webhook.PostAsync(fixture, new ByteArrayContent(bytes), signature);
        using var chunked = await Webhook.PostAsync(fixture, streamed, signature);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, sized.StatusCode);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, chunked.StatusCode);
        Assert.Equal("processing", (await PaymentOfAsync(bookingId)).Status);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("""{"type":"charge.succeeded"}""")]
    [InlineData("""{"id":"evt_1"}""")]
    public async Task Unparsable_bodies_are_400(string body)
    {
        using var response = await Webhook.PostSignedAsync(fixture, body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_event", await CodeAsync(response));
    }

    [Fact]
    public async Task Unknown_event_types_are_acknowledged()
    {
        var bookingId = await ProcessingPaymentAsync();
        var eventId = Webhook.NewEventId();

        using var response = await Webhook.PostSignedAsync(fixture, Webhook.Event("charge.updated", bookingId, "succeeded", id: eventId));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("processing", (await PaymentOfAsync(bookingId)).Status);
        Assert.Equal(1L, await RecordedEventsAsync(eventId));
    }

    private async Task<long> RecordedEventsAsync(string eventId)
    {
        await using var connection = new NpgsqlConnection(fixture.PostgresConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand("SELECT count(*) FROM webhook_events WHERE \"EventId\" = @id", connection);
        command.Parameters.AddWithValue("id", eventId);
        return (long)(await command.ExecuteScalarAsync(Ct))!;
    }
}
