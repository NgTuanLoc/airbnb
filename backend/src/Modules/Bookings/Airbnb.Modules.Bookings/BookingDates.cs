using System.Globalization;

namespace Airbnb.Modules.Bookings;

internal static class BookingDates
{
    internal const int MaxNights = 30;

    internal static DateOnly Today(TimeProvider time) => DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);

    // The stay's dates, or the 400 message explaining what's wrong with them.
    internal static (DateOnly CheckIn, DateOnly CheckOut)? Parse(string checkIn, string checkOut, DateOnly today, out string? error)
    {
        error = null;
        if (!DateOnly.TryParseExact(checkIn, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var from)
            || !DateOnly.TryParseExact(checkOut, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var to))
        {
            error = "Dates must be YYYY-MM-DD";
            return null;
        }
        // One day of slack, as the frontend allows, so a guest whose "today" is still yesterday in UTC can book it.
        if (from < today.AddDays(-1))
        {
            error = "Check-in can't be in the past";
            return null;
        }
        var nights = to.DayNumber - from.DayNumber;
        if (nights <= 0)
        {
            error = "Check-out must be after check-in";
            return null;
        }
        if (nights > MaxNights)
        {
            error = $"Stays can be at most {MaxNights} nights";
            return null;
        }
        return (from, to);
    }
}
