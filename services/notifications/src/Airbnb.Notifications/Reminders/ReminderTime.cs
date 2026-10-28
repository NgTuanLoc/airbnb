namespace Airbnb.Notifications.Reminders;

internal static class ReminderTime
{
    private static readonly TimeOnly SendAt = new(10, 0);

    // The morning after check-out (UTC): the guest is home and the stay is fresh.
    public static DateTimeOffset For(DateOnly checkOut) => new(checkOut.AddDays(1).ToDateTime(SendAt), TimeSpan.Zero);
}
