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
internal sealed class ListingViewsProjection(
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

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
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

        // A full batch is written before anything more is read (retrying while the database is down).
        if (_batch.Count < MaxBatchSize)
        {
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
            if (_batch.Count == 0 || !isDue)
            {
                return;
            }
        }

        if (!await FlushAsync())
        {
            await Task.Delay(RetryDelay, stoppingToken);
        }
    }

    // Never cancelled: a commit cancelled midway may still have landed, and writing the batch again would double count.
    private async Task<bool> FlushAsync()
    {
        if (_batch.Count == 0)
        {
            return true;
        }

        List<TopicPartitionOffset> nextOffsets;
        await using var scope = scopes.CreateAsyncScope();
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<InsightsDbContext>();
            await using var transaction = await db.Database.BeginTransactionAsync();
            foreach (var ((listingId, day), views) in _batch.Counts)
            {
                await db.Database.ExecuteSqlAsync($"""
                    INSERT INTO insights.listing_daily_views ("ListingId", "Day", "Views") VALUES ({listingId}, {day}, {views})
                    ON CONFLICT ("ListingId", "Day") DO UPDATE SET "Views" = listing_daily_views."Views" + EXCLUDED."Views"
                    """);
            }
            foreach (var (partition, nextOffset) in _batch.NextOffsets)
            {
                await db.Database.ExecuteSqlAsync($"""
                    INSERT INTO insights.consumer_offsets ("Topic", "Partition", "NextOffset") VALUES ({ListingViewsTopic.Name}, {partition}, {nextOffset})
                    ON CONFLICT ("Topic", "Partition") DO UPDATE SET "NextOffset" = EXCLUDED."NextOffset"
                    """);
            }
            await transaction.CommitAsync();
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Writing {Count} listing views failed; retrying", _batch.Count);
            return false;
        }

        // Written: nothing below may cause it to be written again.
        nextOffsets = _batch.NextOffsets
            .Select(offset => new TopicPartitionOffset(ListingViewsTopic.Name, offset.Key, offset.Value))
            .ToList();
        _batch.Clear();

        try
        {
            consumer.Commit(nextOffsets);
        }
        catch (KafkaException exception)
        {
            logger.LogDebug(exception, "Couldn't commit listing-views offsets to Kafka (only Kafka UI's lag uses them)");
        }
        await scope.ServiceProvider.GetRequiredService<HybridCache>().RemoveByTagAsync(InsightsModule.CacheTag);
        return true;
    }

    // Wipes every count and stored offset, then starts each partition this consumer owns over from the beginning;
    // partitions assigned later start there anyway, with no stored offset.
    private async Task RebuildAsync()
    {
        _batch.Clear();
        await using (var scope = scopes.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<InsightsDbContext>();
            await using var transaction = await db.Database.BeginTransactionAsync();
            await db.DailyViews.ExecuteDeleteAsync();
            await db.ConsumerOffsets.Where(o => o.Topic == ListingViewsTopic.Name).ExecuteDeleteAsync();
            await transaction.CommitAsync();
            await scope.ServiceProvider.GetRequiredService<HybridCache>().RemoveByTagAsync(InsightsModule.CacheTag);
        }

        foreach (var partition in consumer.Assignment)
        {
            consumer.Seek(new TopicPartitionOffset(partition, Offset.Beginning));
        }
        logger.LogInformation("Rebuilding listing view counts from the start of {Topic}", ListingViewsTopic.Name);
    }

    // Each assigned partition resumes at its stored offset, or at the beginning if it has none.
    internal IEnumerable<TopicPartitionOffset> OnAssigned(List<TopicPartition> partitions)
    {
        using var scope = scopes.CreateScope();
        var stored = scope.ServiceProvider.GetRequiredService<InsightsDbContext>().ConsumerOffsets.AsNoTracking()
            .Where(o => o.Topic == ListingViewsTopic.Name)
            .ToDictionary(o => o.Partition, o => o.NextOffset);
        return partitions
            .Select(partition => new TopicPartitionOffset(
                partition, stored.TryGetValue(partition.Partition.Value, out var next) ? new Offset(next) : Offset.Beginning))
            .ToList();
    }

    // Partitions are moving to another member, which starts from the stored offsets: write what was read from them
    // first. If that fails, drop it instead, and the next owner reads those views again.
    internal void OnRevoked()
    {
        if (!FlushAsync().GetAwaiter().GetResult())
        {
            _batch.Clear();
        }
    }

    // Lost, not handed over: another member may already be reading them from the stored offsets, so writing the
    // pending views would count them twice.
    internal void OnLost() => _batch.Clear();
}
