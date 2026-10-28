using Airbnb.Notifications.Reminders;

namespace Airbnb.Notifications.Tests;

public sealed class ReminderTimeTests
{
    [Fact]
    public void A_reminder_is_due_the_day_after_check_out_at_ten_utc()
    {
        Assert.Equal(new DateTimeOffset(2027, 3, 7, 10, 0, 0, TimeSpan.Zero), ReminderTime.For(new DateOnly(2027, 3, 6)));
    }

    [Fact]
    public void Across_a_month_and_a_year_end()
    {
        Assert.Equal(new DateTimeOffset(2028, 1, 1, 10, 0, 0, TimeSpan.Zero), ReminderTime.For(new DateOnly(2027, 12, 31)));
    }
}
