using Airbnb.Notifications.Contracts;
using Airbnb.Notifications.Data;
using Airbnb.Notifications.Email;
using Airbnb.Notifications.Reminders;
using Wolverine;

namespace Airbnb.Notifications.Handlers;

// Each handler claims its email and sends it inside one transaction: an SMTP failure rolls the claim back and Wolverine
// retries the message; a duplicate delivery finds the claim and does nothing.

public sealed record NotificationsSettings(Uri Frontend);

public static class BookingConfirmedHandler
{
    public static async Task Handle(
        BookingConfirmed booking, NotificationsDbContext db, SmtpEmailSender sender, NotificationsSettings settings,
        IMessageBus bus, TimeProvider time, CancellationToken cancellationToken)
    {
        DateTimeOffset dueAt;
        await using (var transaction = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            if (!await db.TryClaimAsync(booking.BookingId, EmailKinds.Confirmed, time.GetUtcNow(), cancellationToken))
            {
                return;
            }

            var reminder = await db.PendingReminders.FindAsync([booking.BookingId], cancellationToken);
            if (reminder is { Cancelled: true })
            {
                // The cancellation overtook this event: a "confirmed" email now would only confuse.
                await transaction.CommitAsync(cancellationToken);
                return;
            }
            dueAt = ReminderTime.For(booking.CheckOut);
            db.PendingReminders.Add(new PendingReminder
            {
                BookingId = booking.BookingId,
                ListingId = booking.ListingId,
                ListingTitle = booking.ListingTitle,
                GuestName = booking.GuestName,
                GuestEmail = booking.GuestEmail,
                CheckOut = booking.CheckOut,
                DueAt = dueAt,
            });
            await db.SaveChangesAsync(cancellationToken);

            await sender.SendAsync(EmailComposer.Confirmed(booking, settings.Frontend), cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        // Durable (Wolverine's own tables). Lost if the process dies right here; "Send due reminders now" still finds it.
        await bus.ScheduleAsync(new SendReviewReminder(booking.BookingId), dueAt);
    }
}

public static class BookingCancelledHandler
{
    public static async Task Handle(
        BookingCancelled booking, NotificationsDbContext db, SmtpEmailSender sender, NotificationsSettings settings,
        TimeProvider time, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        if (!await db.TryClaimAsync(booking.BookingId, EmailKinds.Cancelled, time.GetUtcNow(), cancellationToken))
        {
            return;
        }

        // Marked rather than deleted, so a confirmation arriving late knows the booking is gone.
        var reminder = await db.PendingReminders.FindAsync([booking.BookingId], cancellationToken);
        if (reminder is null)
        {
            db.PendingReminders.Add(new PendingReminder
            {
                BookingId = booking.BookingId,
                ListingId = booking.ListingId,
                ListingTitle = booking.ListingTitle,
                GuestName = booking.GuestName,
                GuestEmail = booking.GuestEmail,
                CheckOut = booking.CheckOut,
                DueAt = ReminderTime.For(booking.CheckOut),
                Cancelled = true,
            });
        }
        else
        {
            reminder.Cancelled = true;
        }
        await db.SaveChangesAsync(cancellationToken);

        await sender.SendAsync(EmailComposer.Cancelled(booking, settings.Frontend), cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }
}

public sealed record SendReviewReminder(string BookingId);

public static class SendReviewReminderHandler
{
    public static Task Handle(
        SendReviewReminder message, NotificationsDbContext db, SmtpEmailSender sender, NotificationsSettings settings,
        TimeProvider time, CancellationToken cancellationToken) =>
        ReviewReminders.SendAsync(db, sender, settings, time, message.BookingId, cancellationToken);
}
