using System.Diagnostics;
using Airbnb.Modules.Insights.Data;
using Confluent.Kafka;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Airbnb.Modules.Insights;

// The listing-views topic folded into daily counts, exactly once: each flush writes the counts and the offset every
// partition resumes from in one Postgres transaction, and partitions start from those stored offsets. So a crash, a
// restart or a rebalance never counts a view twice or skips one. Kafka's own committed offsets are kept only so Kafka UI
// can show the group's lag.
internal sealed partial class ListingViewsProjection(
    IConsumer<string, string> consumer,
    IServiceScopeFactory scopes,
    ProjectionControl control,
    ILogger<ListingViewsProjection> logger) : BackgroundService
{
    internal const string GroupId = "insights-listing-views";
    private const int MaxBatchSize = 500;
    private static readonly TimeSpan MaxBatchAge = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan PollTimeout = TimeSpan.FromMilliseconds(250);
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(1);

    // Touched only from the loop's thread: rebalance handlers run inside Consume and Close, which the loop calls.
    private readonly ViewBatch _batch = new();
    private readonly Stopwatch _batchAge = new();

    // Set whenever views read into memory are thrown away unwritten (a failed write, a rebuild): before reading on,
    // every owned partition goes back to its stored offset. Nothing is ever written twice from memory, because a
    // write that reported a failure may still have landed, and only the stored offsets know.
    private bool _rewindPending;
    private CancellationToken _stopping;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _stopping = stoppingToken;
        // Consume blocks: get off the host's startup path first.
        await Task.Yield();
        consumer.Subscribe(ListingViewsTopic.Name);
        control.IsRunning = true;
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await StepAsync(stoppingToken);
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    logger.LogError(exception, "The listing views projection failed; retrying");
                    await Task.Delay(RetryDelay, stoppingToken);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down.
        }
        finally
        {
            control.IsRunning = false;
            // Leaving the group hands the partitions over now instead of after the session times out; the revoke
            // handler writes what was already read first.
            consumer.Close();
        }
    }

    private async Task StepAsync(CancellationToken stoppingToken)
    {
        if (control.TakeRebuildRequest())
        {
            await RebuildAsync();
            return;
        }
        if (_rewindPending)
        {
            // Throws while the database is down; the loop waits and comes back here, reading nothing meanwhile.
            Rewind();
            return;
        }

        var result = consumer.Consume(PollTimeout);
        if (result?.Message is { } message)
        {
            if (_batch.Count == 0)
            {
                _batchAge.Restart();
            }
            _batch.Add(result.Partition.Value, result.Offset.Value, message.Value);
        }
        // Written when full, when a second old, or as soon as the topic goes quiet.
        var isDue = result is null || _batch.Count >= MaxBatchSize || _batchAge.Elapsed >= MaxBatchAge;
        if (_batch.Count > 0 && isDue && !await FlushAsync())
        {
            await Task.Delay(RetryDelay, stoppingToken);
        }
    }

    // Never cancelled: a commit cancelled midway may still have landed. On failure the batch is dropped and the owned
    // partitions rewound to their stored offsets (see _rewindPending).
    private async Task<bool> FlushAsync()
    {
        if (_batch.Count == 0)
        {
            return true;
        }

        List<TopicPartitionOffset> nextOffsets;
        HybridCache cache;
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            // A singleton: still usable after the scope ends.
            cache = scope.ServiceProvider.GetRequiredService<HybridCache>();
            var db = scope.ServiceProvider.GetRequiredService<InsightsDbContext>();
            await using var transaction = await db.Database.BeginTransactionAsync(CancellationToken.None);
            foreach (var ((listingId, day), views) in _batch.Counts)
            {
                await db.Database.ExecuteSqlAsync($"""
                    INSERT INTO insights.listing_daily_views ("ListingId", "Day", "Views") VALUES ({listingId}, {day}, {views})
                    ON CONFLICT ("ListingId", "Day") DO UPDATE SET "Views" = listing_daily_views."Views" + EXCLUDED."Views"
                    """, CancellationToken.None);
            }
            foreach (var (partition, nextOffset) in _batch.NextOffsets)
            {
                await db.Database.ExecuteSqlAsync($"""
                    INSERT INTO insights.consumer_offsets ("Topic", "Partition", "NextOffset") VALUES ({ListingViewsTopic.Name}, {partition}, {nextOffset})
                    ON CONFLICT ("Topic", "Partition") DO UPDATE SET "NextOffset" = EXCLUDED."NextOffset"
                    """, CancellationToken.None);
            }
            await transaction.CommitAsync(CancellationToken.None);
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Writing {Count} listing views failed; reading them again from the stored offsets", _batch.Count);
            DropBatch();
            return false;
        }

        // Written: nothing below may cause it to be written again.
        nextOffsets = [.. _batch.NextOffsets.Select(offset => new TopicPartitionOffset(ListingViewsTopic.Name, offset.Key, offset.Value))];
        _batch.Clear();

        try
        {
            consumer.Commit(nextOffsets);
        }
        catch (KafkaException exception)
        {
            logger.LogDebug(exception, "Couldn't commit listing-views offsets to Kafka (only Kafka UI's lag uses them)");
        }
        await cache.RemoveByTagAsync(InsightsModule.CacheTag, CancellationToken.None);
        return true;
    }

    // Wipes every count and stored offset, then rewinds: with nothing stored, every owned partition starts over from the
    // beginning (and partitions assigned later start there anyway). A wipe that fails is asked for again; wiping twice is
    // harmless, so it doesn't matter whether a failed wipe landed.
    private async Task RebuildAsync()
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<InsightsDbContext>();
            await using var transaction = await db.Database.BeginTransactionAsync(CancellationToken.None);
            await db.DailyViews.ExecuteDeleteAsync(CancellationToken.None);
            await db.ConsumerOffsets.Where(o => o.Topic == ListingViewsTopic.Name).ExecuteDeleteAsync(CancellationToken.None);
            await transaction.CommitAsync(CancellationToken.None);
            await scope.ServiceProvider.GetRequiredService<HybridCache>().RemoveByTagAsync(InsightsModule.CacheTag, CancellationToken.None);
        }
        catch
        {
            control.RequestRebuild();
            throw;
        }

        // Whatever was read into memory is counted by the replay instead.
        DropBatch();
        LogRebuilding(logger, ListingViewsTopic.Name);
    }

    private void DropBatch()
    {
        _batch.Clear();
        _rewindPending = true;
    }

    // Every owned partition back to its stored offset (the beginning when none is stored): views dropped unwritten are
    // read again, and views already written aren't.
    private void Rewind()
    {
        var stored = LoadStoredOffsets();
        foreach (var partition in consumer.Assignment)
        {
            consumer.Seek(new TopicPartitionOffset(partition, StartOf(partition, stored)));
        }
        _rewindPending = false;
    }

    // Each assigned partition starts at its stored offset, or at the beginning when none is stored. Nothing can be read
    // without those, so a failed read is retried until the database answers or the host stops; if that outlasts
    // max.poll.interval.ms, the client leaves the group and joins again, which brings a fresh assignment.
    internal IEnumerable<TopicPartitionOffset> OnAssigned(List<TopicPartition> partitions)
    {
        while (true)
        {
            try
            {
                var stored = LoadStoredOffsets();
                // The assignment itself starts every partition at its stored offset.
                _rewindPending = false;
                return [.. partitions.Select(partition => new TopicPartitionOffset(partition, StartOf(partition, stored)))];
            }
            catch (Exception exception) when (!_stopping.IsCancellationRequested)
            {
                logger.LogWarning(exception, "Couldn't read the stored listing-views offsets for an assignment; retrying");
                _stopping.WaitHandle.WaitOne(RetryDelay);
            }
        }
    }

    // Partitions are moving to another member, which starts from the stored offsets: write what was read from them
    // first. If that write fails the batch is dropped, the next owner reads those views again, and any partition this
    // member keeps (cooperative rebalancing) is rewound.
    internal void OnRevoked() => FlushAsync().GetAwaiter().GetResult();

    // Lost, not handed over: another member may already be reading them from the stored offsets, so writing the
    // pending views would count them twice.
    internal void OnLost() => DropBatch();

    private Dictionary<int, long> LoadStoredOffsets()
    {
        using var scope = scopes.CreateScope();
        return scope.ServiceProvider.GetRequiredService<InsightsDbContext>().ConsumerOffsets.AsNoTracking()
            .Where(o => o.Topic == ListingViewsTopic.Name)
            .ToDictionary(o => o.Partition, o => o.NextOffset);
    }

    private static Offset StartOf(TopicPartition partition, Dictionary<int, long> stored) =>
        stored.TryGetValue(partition.Partition.Value, out var next) ? new Offset(next) : Offset.Beginning;

    [LoggerMessage(Level = LogLevel.Information, Message = "Rebuilding listing view counts from the start of {Topic}")]
    private static partial void LogRebuilding(ILogger logger, string topic);
}
