using Airbnb.Modules.Insights;

namespace Airbnb.UnitTests.Insights;

public sealed class WeeklyViewsTests
{
    private static readonly DateOnly Today = new(2026, 10, 28);

    [Fact]
    public void Today_and_the_six_days_before_are_the_last_week()
    {
        var views = WeeklyViews.From("l1", [(Today, 5), (Today.AddDays(-6), 2)], Today);

        Assert.Equal(new WeeklyViews("l1", Last7Days: 7, Previous7Days: 0), views);
    }

    [Fact]
    public void The_seven_days_before_those_are_the_week_before()
    {
        var views = WeeklyViews.From("l1", [(Today.AddDays(-7), 3), (Today.AddDays(-13), 1)], Today);

        Assert.Equal(new WeeklyViews("l1", Last7Days: 0, Previous7Days: 4), views);
    }

    [Fact]
    public void Older_days_and_future_days_are_ignored()
    {
        var views = WeeklyViews.From("l1", [(Today.AddDays(-14), 9), (Today.AddDays(1), 9), (Today, 1)], Today);

        Assert.Equal(new WeeklyViews("l1", Last7Days: 1, Previous7Days: 0), views);
    }

    [Fact]
    public void No_rows_is_zero_views()
    {
        Assert.Equal(new WeeklyViews("l1", 0, 0), WeeklyViews.From("l1", [], Today));
    }
}
