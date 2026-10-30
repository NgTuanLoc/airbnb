using System.Net;

namespace Airbnb.Notifications.Tests.Integration;

// Events in through the broker, emails out through Mailpit. Every test uses its own guest email, so tests never see
// each other's mail.
public sealed class BookingEmailTests(ServiceFixture fixture)
{
    private static readonly TimeSpan MailTimeout = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan Settle = TimeSpan.FromSeconds(3);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string NewEmail() => $"guest-{Guid.NewGuid():N}@example.com";

    private static object Confirmed(string bookingId, string email) => new
    {
        bookingId,
        listingId = "l7",
        listingTitle = "Seaside villa",
        guestName = "Ana",
        guestEmail = email,
        checkIn = "2027-03-03",
        checkOut = "2027-03-06",
        adults = 2,
        children = 0,
        total = 980.50m,
        confirmedAt = "2026-10-28T09:00:00+00:00",
    };

    private static object Cancelled(string bookingId, string email) => new
    {
        bookingId,
        listingId = "l7",
        listingTitle = "Seaside villa",
        guestName = "Ana",
        guestEmail = email,
        checkIn = "2027-03-03",
        checkOut = "2027-03-06",
        cancelledAt = "2026-10-29T09:00:00+00:00",
    };

    private async Task<List<MailpitMessage>> WaitForEmailsAsync(string email, int count)
    {
        var deadline = DateTime.UtcNow + MailTimeout;
        List<MailpitMessage> found;
        do
        {
            found = await fixture.EmailsToAsync(email, Ct);
            if (found.Count >= count)
            {
                return found;
            }
            await Task.Delay(250, Ct);
        }
        while (DateTime.UtcNow < deadline);
        Assert.Fail($"Expected {count} emails to {email}, got {found.Count}: {string.Join(" | ", found.Select(m => m.Subject))}");
        return found;
    }

    // What's in the inbox once things have had time to arrive (for asserting that nothing more came).
    private async Task<List<MailpitMessage>> SettledEmailsAsync(string email)
    {
        await Task.Delay(Settle, Ct);
        return await fixture.EmailsToAsync(email, Ct);
    }

    private static async Task<HttpResponseMessage> SendDueAsync(HttpClient client, string? key)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/reminders/send-due");
        if (key is not null)
        {
            request.Headers.Add("X-Admin-Key", key);
        }
        return await client.SendAsync(request, Ct);
    }

    [Fact]
    public async Task Confirmed_sends_one_email()
    {
        var email = NewEmail();

        await fixture.PublishAsync("booking-confirmed", Confirmed($"bk_{Guid.NewGuid():N}", email), Ct);

        var message = Assert.Single(await WaitForEmailsAsync(email, 1));
        Assert.Equal("Your stay at Seaside villa is confirmed", message.Subject);
        Assert.Single(await SettledEmailsAsync(email));
    }

    [Fact]
    public async Task Duplicate_delivery_sends_one_email()
    {
        var email = NewEmail();
        var booking = Confirmed($"bk_{Guid.NewGuid():N}", email);

        await Task.WhenAll(
            fixture.PublishAsync("booking-confirmed", booking, Ct),
            fixture.PublishAsync("booking-confirmed", booking, Ct));

        await WaitForEmailsAsync(email, 1);
        Assert.Single(await SettledEmailsAsync(email));
    }

    [Fact]
    public async Task Cancelled_sends_a_cancellation_and_drops_the_reminder()
    {
        var email = NewEmail();
        var bookingId = $"bk_{Guid.NewGuid():N}";
        await fixture.PublishAsync("booking-confirmed", Confirmed(bookingId, email), Ct);
        await WaitForEmailsAsync(email, 1);

        await fixture.PublishAsync("booking-cancelled", Cancelled(bookingId, email), Ct);
        await WaitForEmailsAsync(email, 2);
        using var client = fixture.Service.CreateClient();
        using var sent = await SendDueAsync(client, ServiceFixture.AdminKey);
        Assert.Equal(HttpStatusCode.OK, sent.StatusCode);

        var subjects = (await SettledEmailsAsync(email)).Select(m => m.Subject).Order().ToArray();
        Assert.Equal(["Your stay at Seaside villa is cancelled", "Your stay at Seaside villa is confirmed"], subjects);
    }

    [Fact]
    public async Task Cancelled_before_confirmed_never_reminds()
    {
        var email = NewEmail();
        var bookingId = $"bk_{Guid.NewGuid():N}";

        // Out of order: the cancellation overtakes the confirmation.
        await fixture.PublishAsync("booking-cancelled", Cancelled(bookingId, email), Ct);
        await WaitForEmailsAsync(email, 1);
        await fixture.PublishAsync("booking-confirmed", Confirmed(bookingId, email), Ct);
        // Only once the late confirmation has been handled does "no reminder" mean anything.
        var deadline = DateTime.UtcNow + MailTimeout;
        while (await fixture.ScalarAsync($"""SELECT count(*) FROM sent_emails WHERE "BookingId" = '{bookingId}' AND "Kind" = 'confirmed'""", Ct) == 0
            && DateTime.UtcNow < deadline)
        {
            await Task.Delay(100, Ct);
        }
        using var client = fixture.Service.CreateClient();
        using var sent = await SendDueAsync(client, ServiceFixture.AdminKey);
        Assert.Equal(HttpStatusCode.OK, sent.StatusCode);

        // Only the cancellation: a "confirmed" after "cancelled" would confuse, and there's no stay to review.
        var message = Assert.Single(await SettledEmailsAsync(email));
        Assert.Equal("Your stay at Seaside villa is cancelled", message.Subject);
    }

    [Fact]
    public async Task Send_due_reminders_sends_each_once()
    {
        var email = NewEmail();
        await fixture.PublishAsync("booking-confirmed", Confirmed($"bk_{Guid.NewGuid():N}", email), Ct);
        await WaitForEmailsAsync(email, 1);
        using var client = fixture.Service.CreateClient();

        using var first = await SendDueAsync(client, ServiceFixture.AdminKey);
        using var second = await SendDueAsync(client, ServiceFixture.AdminKey);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var subjects = (await SettledEmailsAsync(email)).Select(m => m.Subject).Order().ToArray();
        Assert.Equal(["How was your stay at Seaside villa?", "Your stay at Seaside villa is confirmed"], subjects);
    }

    [Fact]
    public async Task Send_due_needs_the_admin_key()
    {
        using var client = fixture.Service.CreateClient();
        using var missing = await SendDueAsync(client, key: null);
        using var wrong = await SendDueAsync(client, "not-the-key");
        Assert.Equal(HttpStatusCode.Unauthorized, missing.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);

        await using var keyless = fixture.Factory(adminKey: null);
        using var keylessClient = keyless.CreateClient();
        using var notFound = await SendDueAsync(keylessClient, ServiceFixture.AdminKey);
        Assert.Equal(HttpStatusCode.NotFound, notFound.StatusCode);
    }

    [Fact]
    public async Task A_due_reminder_is_sent_even_if_nothing_scheduled_it()
    {
        // As if the process died between committing the confirmation and scheduling its reminder: only the row exists.
        var email = NewEmail();
        var bookingId = $"bk_{Guid.NewGuid():N}";
        await fixture.ScalarAsync($"""
            INSERT INTO pending_reminders ("BookingId", "ListingId", "ListingTitle", "GuestName", "GuestEmail", "CheckOut", "DueAt", "Cancelled")
            VALUES ('{bookingId}', 'l7', 'Seaside villa', 'Ana', '{email}', DATE '2026-01-01', TIMESTAMPTZ '2026-01-02 10:00:00+00', false)
            """, Ct);

        var message = Assert.Single(await WaitForEmailsAsync(email, 1));
        Assert.Equal("How was your stay at Seaside villa?", message.Subject);
        Assert.Single(await SettledEmailsAsync(email));
    }

    [Fact]
    public async Task Smtp_outage_longer_than_the_quick_retries_still_sends_once()
    {
        var email = NewEmail();
        await fixture.StopMailpitAsync(Ct);
        try
        {
            await fixture.PublishAsync("booking-confirmed", Confirmed($"bk_{Guid.NewGuid():N}", email), Ct);
            // Past the quick retries (1 s, 3 s, 10 s), which used to end in the dead-letter queue.
            await Task.Delay(TimeSpan.FromSeconds(20), Ct);
        }
        finally
        {
            await fixture.StartMailpitAsync(Ct);
        }

        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(60);
        while ((await fixture.EmailsToAsync(email, Ct)).Count == 0 && DateTime.UtcNow < deadline)
        {
            await Task.Delay(500, Ct);
        }
        Assert.Single(await SettledEmailsAsync(email));
    }

    [Fact]
    public async Task Smtp_outage_is_retried_and_sends_once()
    {
        var email = NewEmail();
        await fixture.StopMailpitAsync(Ct);
        try
        {
            await fixture.PublishAsync("booking-confirmed", Confirmed($"bk_{Guid.NewGuid():N}", email), Ct);
            await Task.Delay(TimeSpan.FromSeconds(2), Ct);
        }
        finally
        {
            await fixture.StartMailpitAsync(Ct);
        }

        await WaitForEmailsAsync(email, 1);
        Assert.Single(await SettledEmailsAsync(email));
    }
}
