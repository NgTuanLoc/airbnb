using System.Security.Cryptography;
using System.Text;
using Airbnb.Notifications.Data;
using Airbnb.Notifications.Email;
using Airbnb.Notifications.Handlers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Notifications.Reminders;

public static class ReviewReminders
{
    internal const string AdminKeyHeader = "X-Admin-Key";

    // Sends one booking's reminder unless it was cancelled or already sent. False when nothing was sent.
    public static async Task<bool> SendAsync(
        NotificationsDbContext db, SmtpEmailSender sender, NotificationsSettings settings, TimeProvider time,
        string bookingId, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var reminder = await db.PendingReminders.AsNoTracking().SingleOrDefaultAsync(r => r.BookingId == bookingId, cancellationToken);
        if (reminder is null or { Cancelled: true }
            || !await db.TryClaimAsync(bookingId, EmailKinds.ReviewReminder, time.GetUtcNow(), cancellationToken))
        {
            return false;
        }
        await sender.SendAsync(EmailComposer.ReviewReminder(reminder, settings.Frontend), cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    // "Send due reminders now" (an AppHost dashboard command): every reminder still waiting, whatever its date, so the
    // flow can be tried without waiting for a real check-out. Without a configured key the endpoint doesn't exist.
    public static void MapSendDue(this IEndpointRouteBuilder app) =>
        app.MapPost("/reminders/send-due", async Task<IResult> (
            IConfiguration configuration, NotificationsDbContext db, SmtpEmailSender sender, NotificationsSettings settings,
            TimeProvider time, [FromHeader(Name = AdminKeyHeader)] string? key, CancellationToken cancellationToken) =>
        {
            var expected = configuration["Notifications:AdminKey"];
            if (string.IsNullOrEmpty(expected))
            {
                return TypedResults.NotFound();
            }
            if (key is null || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(key)))
            {
                return TypedResults.Unauthorized();
            }

            return TypedResults.Ok(new { sent = await SendWaitingAsync(db, sender, settings, time, dueBy: null, cancellationToken) });
        });

    // Every reminder not cancelled and not yet sent, due by the given time (or all of them). Returns how many went out.
    public static async Task<int> SendWaitingAsync(
        NotificationsDbContext db, SmtpEmailSender sender, NotificationsSettings settings, TimeProvider time,
        DateTimeOffset? dueBy, CancellationToken cancellationToken)
    {
        var waiting = await db.PendingReminders.AsNoTracking()
            .Where(r => !r.Cancelled
                && (dueBy == null || r.DueAt <= dueBy)
                && !db.SentEmails.Any(e => e.BookingId == r.BookingId && e.Kind == EmailKinds.ReviewReminder))
            .Select(r => r.BookingId)
            .ToListAsync(cancellationToken);
        var sent = 0;
        foreach (var bookingId in waiting)
        {
            if (await SendAsync(db, sender, settings, time, bookingId, cancellationToken))
            {
                sent++;
            }
        }
        return sent;
    }
}
