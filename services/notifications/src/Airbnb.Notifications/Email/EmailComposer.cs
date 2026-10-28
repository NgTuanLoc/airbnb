using System.Globalization;
using System.Net;
using Airbnb.Notifications.Contracts;
using Airbnb.Notifications.Data;

namespace Airbnb.Notifications.Email;

internal sealed record EmailMessage(string To, string ToName, string Subject, string TextBody, string HtmlBody);

// The three emails, as plain text plus a minimal HTML body. Titles and names come from guests and hosts, so the HTML
// escapes them; an event without a title (an older host-listing quote) reads "your stay".
internal static class EmailComposer
{
    private static readonly CultureInfo English = CultureInfo.GetCultureInfo("en-US");

    public static EmailMessage Confirmed(BookingConfirmed booking, Uri frontend)
    {
        var stay = Stay(booking.ListingTitle);
        var guests = booking.Adults + booking.Children;
        var details = $"{Dates(booking.CheckIn, booking.CheckOut)} · {guests} {(guests == 1 ? "guest" : "guests")}";
        var total = booking.Total.ToString("C", English);
        var trip = Link(frontend, $"trips/{booking.BookingId}");
        return Compose(
            booking.GuestEmail,
            booking.GuestName,
            stay is null ? "Your stay is confirmed" : $"Your stay at {stay} is confirmed",
            [
                "Your booking is confirmed.",
                stay ?? "Your stay",
                details,
                $"Total: {total}",
            ],
            ("See your trip", trip));
    }

    public static EmailMessage Cancelled(BookingCancelled booking, Uri frontend)
    {
        var stay = Stay(booking.ListingTitle);
        return Compose(
            booking.GuestEmail,
            booking.GuestName,
            stay is null ? "Your stay is cancelled" : $"Your stay at {stay} is cancelled",
            [
                $"Your booking for {stay ?? "your stay"}, {Dates(booking.CheckIn, booking.CheckOut)}, is cancelled.",
            ],
            ("Find another place", Link(frontend, "")));
    }

    public static EmailMessage ReviewReminder(PendingReminder reminder, Uri frontend)
    {
        var stay = Stay(reminder.ListingTitle);
        return Compose(
            reminder.GuestEmail,
            reminder.GuestName,
            stay is null ? "How was your stay?" : $"How was your stay at {stay}?",
            [
                "We hope you had a great time. A short review helps the host and the next guests.",
            ],
            ("Leave a review", Link(frontend, $"rooms/{reminder.ListingId}")));
    }

    private static string? Stay(string title) => string.IsNullOrWhiteSpace(title) ? null : title.Trim();

    private static string Dates(DateOnly checkIn, DateOnly checkOut) =>
        $"{checkIn.ToString("MMM d, yyyy", English)} – {checkOut.ToString("MMM d, yyyy", English)}";

    private static string Link(Uri frontend, string path) => new Uri(frontend, path).ToString();

    private static EmailMessage Compose(string to, string name, string subject, string[] lines, (string Label, string Url) action)
    {
        var text = string.Join("\n\n", [$"Hi {name},", .. lines, $"{action.Label}: {action.Url}"]);
        var paragraphs = string.Concat(lines.Select(line => $"<p>{WebUtility.HtmlEncode(line)}</p>"));
        var html = $"""
            <p>Hi {WebUtility.HtmlEncode(name)},</p>{paragraphs}<p><a href="{WebUtility.HtmlEncode(action.Url)}">{WebUtility.HtmlEncode(action.Label)}</a></p>
            """;
        return new EmailMessage(to, name, subject, text, html);
    }
}
