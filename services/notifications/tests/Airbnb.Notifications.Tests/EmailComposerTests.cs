using Airbnb.Notifications.Contracts;
using Airbnb.Notifications.Data;
using Airbnb.Notifications.Email;

namespace Airbnb.Notifications.Tests;

public sealed class EmailComposerTests
{
    private static readonly Uri Frontend = new("http://localhost:3000");

    private static BookingConfirmed Confirmed(string title = "Cozy cabin in the pines") => new(
        "bk_1", "l1", title, "Ana", "ana@example.com",
        new DateOnly(2027, 3, 3), new DateOnly(2027, 3, 6), Adults: 2, Children: 1, Total: 1234m,
        ConfirmedAt: new DateTimeOffset(2026, 10, 28, 9, 0, 0, TimeSpan.Zero));

    private static BookingCancelled Cancelled(string title = "Cozy cabin in the pines") => new(
        "bk_1", "l1", title, "Ana", "ana@example.com",
        new DateOnly(2027, 3, 3), new DateOnly(2027, 3, 6), new DateTimeOffset(2026, 10, 29, 9, 0, 0, TimeSpan.Zero));

    private static PendingReminder Reminder(string title = "Cozy cabin in the pines") => new()
    {
        BookingId = "bk_1", ListingId = "l1", ListingTitle = title, GuestName = "Ana", GuestEmail = "ana@example.com",
        CheckOut = new DateOnly(2027, 3, 6), DueAt = new DateTimeOffset(2027, 3, 7, 10, 0, 0, TimeSpan.Zero),
    };

    [Fact]
    public void Confirmation_has_the_stay_and_a_link_to_the_trip()
    {
        var email = EmailComposer.Confirmed(Confirmed(), Frontend);

        Assert.Equal(("ana@example.com", "Ana"), (email.To, email.ToName));
        Assert.Equal("Your stay at Cozy cabin in the pines is confirmed", email.Subject);
        Assert.Contains("Mar 3, 2027 – Mar 6, 2027", email.TextBody);
        Assert.Contains("3 guests", email.TextBody);
        Assert.Contains("$1,234.00", email.TextBody);
        Assert.Contains("http://localhost:3000/trips/bk_1", email.TextBody);
        Assert.Contains("http://localhost:3000/trips/bk_1", email.HtmlBody);
    }

    [Fact]
    public void Cancellation_names_the_stay()
    {
        var email = EmailComposer.Cancelled(Cancelled(), Frontend);

        Assert.Equal("Your stay at Cozy cabin in the pines is cancelled", email.Subject);
        Assert.Contains("Mar 3, 2027 – Mar 6, 2027", email.TextBody);
    }

    [Fact]
    public void Reminder_links_to_the_listing_for_a_review()
    {
        var email = EmailComposer.ReviewReminder(Reminder(), Frontend);

        Assert.Equal("How was your stay at Cozy cabin in the pines?", email.Subject);
        Assert.Contains("http://localhost:3000/rooms/l1", email.TextBody);
        Assert.Contains("http://localhost:3000/rooms/l1", email.HtmlBody);
    }

    [Fact]
    public void Without_a_title_the_emails_say_your_stay()
    {
        Assert.Equal("Your stay is confirmed", EmailComposer.Confirmed(Confirmed(" "), Frontend).Subject);
        Assert.Equal("Your stay is cancelled", EmailComposer.Cancelled(Cancelled(""), Frontend).Subject);
        Assert.Equal("How was your stay?", EmailComposer.ReviewReminder(Reminder(""), Frontend).Subject);
        Assert.Contains("your stay", EmailComposer.Confirmed(Confirmed(""), Frontend).TextBody, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void The_html_body_escapes_what_guests_and_hosts_typed()
    {
        var email = EmailComposer.Confirmed(Confirmed("<b>Tom & Jerry</b>") with { GuestName = "<script>x</script>" }, Frontend);

        Assert.Contains("&lt;b&gt;Tom &amp; Jerry&lt;/b&gt;", email.HtmlBody);
        Assert.DoesNotContain("<script>", email.HtmlBody);
        Assert.DoesNotContain("<b>Tom", email.HtmlBody);
    }

    [Fact]
    public void One_guest_is_singular()
    {
        Assert.Matches(@"\b1 guest\b(?!s)",EmailComposer.Confirmed(Confirmed() with { Adults = 1, Children = 0 }, Frontend).TextBody);
    }
}
