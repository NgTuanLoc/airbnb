namespace Airbnb.Modules.Insights;

// What GET /api/listings/{id}/views returns: views over the last 7 UTC days (today included) and the 7 before those.
internal sealed record WeeklyViews(string ListingId, long Last7Days, long Previous7Days)
{
    public static WeeklyViews From(string listingId, IEnumerable<(DateOnly Day, long Views)> days, DateOnly today)
    {
        long last = 0, previous = 0;
        foreach (var (day, views) in days)
        {
            var age = today.DayNumber - day.DayNumber;
            if (age is >= 0 and < 7)
            {
                last += views;
            }
            else if (age is >= 7 and < 14)
            {
                previous += views;
            }
        }
        return new WeeklyViews(listingId, last, previous);
    }
}
