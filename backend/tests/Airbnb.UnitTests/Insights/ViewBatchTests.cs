using Airbnb.Modules.Insights;

namespace Airbnb.UnitTests.Insights;

public sealed class ViewBatchTests
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 28, 9, 0, 0, TimeSpan.Zero);

    private static string View(string listingId, DateTimeOffset at) => new ListingViewEvent(listingId, at).Serialize();

    [Fact]
    public void Counts_views_per_listing_and_day()
    {
        var batch = new ViewBatch();

        batch.Add(partition: 0, offset: 10, View("l1", Morning));
        batch.Add(partition: 0, offset: 11, View("l1", Morning.AddHours(3)));
        batch.Add(partition: 1, offset: 4, View("l2", Morning));

        Assert.Equal(3, batch.Count);
        Assert.Equal(2, batch.Counts[("l1", new DateOnly(2026, 10, 28))]);
        Assert.Equal(1, batch.Counts[("l2", new DateOnly(2026, 10, 28))]);
    }

    [Fact]
    public void Splits_views_at_midnight_utc()
    {
        var batch = new ViewBatch();

        batch.Add(0, 1, View("l1", new DateTimeOffset(2026, 10, 28, 23, 59, 59, TimeSpan.Zero)));
        // 00:30 in UTC+2 is still the 27th in UTC.
        batch.Add(0, 2, View("l1", new DateTimeOffset(2026, 10, 28, 0, 30, 0, TimeSpan.FromHours(2))));

        Assert.Equal(1, batch.Counts[("l1", new DateOnly(2026, 10, 28))]);
        Assert.Equal(1, batch.Counts[("l1", new DateOnly(2026, 10, 27))]);
    }

    [Fact]
    public void Next_offset_per_partition_is_one_past_the_last_seen()
    {
        var batch = new ViewBatch();

        batch.Add(0, 10, View("l1", Morning));
        batch.Add(0, 12, View("l1", Morning));
        batch.Add(2, 7, View("l3", Morning));

        Assert.Equal(13, batch.NextOffsets[0]);
        Assert.Equal(8, batch.NextOffsets[2]);
        Assert.False(batch.NextOffsets.ContainsKey(1));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("""{"listingId":"..","viewedAt":"2026-10-28T09:00:00+00:00"}""")]
    [InlineData("""{"listingId":"l1"}""")]
    public void A_malformed_view_moves_the_offset_but_counts_nothing(string? value)
    {
        var batch = new ViewBatch();

        batch.Add(0, 5, value);

        Assert.Empty(batch.Counts);
        Assert.Equal(6, batch.NextOffsets[0]);
        Assert.Equal(1, batch.Count);
    }

    [Fact]
    public void Clear_empties_the_batch()
    {
        var batch = new ViewBatch();
        batch.Add(0, 1, View("l1", Morning));

        batch.Clear();

        Assert.Equal(0, batch.Count);
        Assert.Empty(batch.Counts);
        Assert.Empty(batch.NextOffsets);
    }

    [Fact]
    public void An_event_round_trips_through_its_wire_format()
    {
        var view = new ListingViewEvent("l3", Morning);

        Assert.True(ListingViewEvent.TryParse(view.Serialize(), out var parsed));
        Assert.Equal(view, parsed);
        Assert.Equal("""{"listingId":"l3","viewedAt":"2026-10-28T09:00:00+00:00"}""", view.Serialize());
    }
}
