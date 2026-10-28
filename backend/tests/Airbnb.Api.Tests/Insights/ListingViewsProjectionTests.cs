using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Insights;

// Exactly once under the failures a live broker can't be made to produce on demand (ProjectionHarness).
public sealed class ListingViewsProjectionTests(InfrastructureFixture infrastructure)
{
    private static readonly DateTimeOffset Now = DateTimeOffset.UtcNow;
    private static readonly DateOnly Today = DateOnly.FromDateTime(Now.UtcDateTime);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string NewListingId() => $"hl-{Guid.NewGuid()}";

    private Task<ProjectionHarness> HarnessAsync() => ProjectionHarness.CreateAsync(infrastructure.PostgresConnectionString);

    [Fact]
    public async Task A_write_that_lands_but_reports_failure_is_not_counted_twice()
    {
        await using var harness = await HarnessAsync();
        var listing = NewListingId();
        for (var i = 0; i < 3; i++) harness.Publish(0, listing, Now);
        harness.Faults.FailNextCommitAfterItLands();

        await harness.Projection.StartAsync(Ct);
        await ProjectionHarness.WaitUntilAsync(async () => await harness.StoredOffsetAsync(0) == 3, "partition 0 is stored at offset 3");
        // Past the retry delay, after which a batch kept in memory would be written a second time.
        await Task.Delay(TimeSpan.FromSeconds(2), Ct);
        await harness.Projection.StopAsync(Ct);

        Assert.Equal(3, await harness.ViewsAsync(listing));
    }

    [Fact]
    public async Task A_write_that_fails_is_read_again_and_nothing_is_lost()
    {
        await using var harness = await HarnessAsync();
        var listing = NewListingId();
        for (var i = 0; i < 3; i++) harness.Publish(0, listing, Now);
        harness.Faults.FailNextCommitBeforeItLands();

        await harness.Projection.StartAsync(Ct);
        await ProjectionHarness.WaitUntilAsync(async () => await harness.ViewsAsync(listing) == 3, "the 3 views are counted");
        harness.Publish(0, listing, Now);
        harness.Publish(0, listing, Now);
        await ProjectionHarness.WaitUntilAsync(async () => await harness.ViewsAsync(listing) == 5, "5 views are counted");
        await harness.Projection.StopAsync(Ct);

        Assert.Equal(5, await harness.ViewsAsync(listing));
    }

    [Fact]
    public async Task An_assignment_waits_for_the_database_instead_of_stalling()
    {
        await using var harness = await HarnessAsync();
        var listing = NewListingId();
        harness.Publish(0, listing, Now);
        harness.Publish(0, listing, Now);
        // The assignment's read of the stored offsets fails twice, as if Postgres were restarting during the rebalance.
        harness.Scopes.FailNext(2);

        await harness.Projection.StartAsync(Ct);
        await ProjectionHarness.WaitUntilAsync(async () => await harness.ViewsAsync(listing) == 2, "the views are counted after the database is back");
        await harness.Projection.StopAsync(Ct);
    }

    [Fact]
    public async Task A_rebalance_in_the_middle_of_a_batch_neither_loses_nor_repeats_views()
    {
        await using var harness = await HarnessAsync();
        var listing = NewListingId();
        for (var i = 0; i < 4; i++) harness.Publish(0, listing, Now);
        // Two views are read but not yet written when the partitions are revoked and assigned again.
        harness.Consumer.RebalanceOnConsumeCall = 3;

        await harness.Projection.StartAsync(Ct);
        await ProjectionHarness.WaitUntilAsync(async () => await harness.StoredOffsetAsync(0) == 4, "partition 0 is stored at offset 4");
        await Task.Delay(TimeSpan.FromSeconds(1.5), Ct);
        await harness.Projection.StopAsync(Ct);

        Assert.Equal(4, await harness.ViewsAsync(listing));
    }

    [Fact]
    public async Task A_rebuild_that_fails_is_tried_again()
    {
        await using var harness = await HarnessAsync();
        var listing = NewListingId();
        for (var i = 0; i < 3; i++) harness.Publish(0, listing, Now);
        await harness.Projection.StartAsync(Ct);
        await ProjectionHarness.WaitUntilAsync(async () => await harness.ViewsAsync(listing) == 3, "the 3 views are counted");

        // Only a rebuild brings a tampered count back to what the log says.
        await harness.SetViewsAsync(listing, Today, 99);
        harness.Faults.FailNextCommitBeforeItLands();
        Assert.True(harness.Control.RequestRebuild());

        await ProjectionHarness.WaitUntilAsync(async () => await harness.ViewsAsync(listing) == 3, "the rebuild recounts the log");
        await harness.Projection.StopAsync(Ct);
    }
}
