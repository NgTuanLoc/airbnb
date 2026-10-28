using System.Data.Common;
using Airbnb.Modules.Insights;
using Airbnb.Modules.Insights.Data;
using Confluent.Kafka;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace Airbnb.Api.Tests.Insights;

// The projection against a fake consumer and its own database, for the failures a real broker can't be made to produce
// on demand: a database that fails during an assignment, a commit that lands but reports failure, a rebalance in the
// middle of a batch. The fake calls the rebalance handlers from inside Consume and Close, as librdkafka does.
internal sealed class ProjectionHarness : IAsyncDisposable
{
    private static readonly TimeSpan WaitTimeout = TimeSpan.FromSeconds(20);

    private readonly string _adminConnectionString;
    private readonly string _database;
    private readonly ServiceProvider _services;

    private ProjectionHarness(
        string adminConnectionString, string database, ServiceProvider services, FakeConsumer consumer, FailingScopes scopes, CommitFaults faults)
    {
        _adminConnectionString = adminConnectionString;
        _database = database;
        _services = services;
        Consumer = consumer;
        Scopes = scopes;
        Faults = faults;
        Projection = new ListingViewsProjection(consumer, scopes, Control, NullLogger<ListingViewsProjection>.Instance);
        consumer.Projection = Projection;
    }

    public FakeConsumer Consumer { get; }

    public FailingScopes Scopes { get; }

    public CommitFaults Faults { get; }

    public ProjectionControl Control { get; } = new();

    public ListingViewsProjection Projection { get; }

    public static async Task<ProjectionHarness> CreateAsync(string postgresConnectionString, int partitions = 1)
    {
        var database = $"insights_{Guid.NewGuid():N}";
        await using (var admin = new NpgsqlConnection(postgresConnectionString))
        {
            await admin.OpenAsync();
            await using var create = new NpgsqlCommand($"""CREATE DATABASE "{database}" """, admin);
            await create.ExecuteNonQueryAsync();
        }

        var faults = new CommitFaults();
        var connectionString = new NpgsqlConnectionStringBuilder(postgresConnectionString) { Database = database }.ConnectionString;
        var services = new ServiceCollection()
            .AddDbContext<InsightsDbContext>(options => options.UseNpgsql(connectionString).AddInterceptors(faults))
            .AddHybridCache().Services
            .BuildServiceProvider();
        await using (var scope = services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<InsightsDbContext>().Database.MigrateAsync();
        }

        return new ProjectionHarness(
            postgresConnectionString, database, services, new FakeConsumer(partitions),
            new FailingScopes(services.GetRequiredService<IServiceScopeFactory>()), faults);
    }

    public void Publish(int partition, string listingId, DateTimeOffset viewedAt) =>
        Consumer.Publish(partition, new ListingViewEvent(listingId, viewedAt).Serialize());

    public async Task<long> ViewsAsync(string listingId)
    {
        await using var scope = _services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<InsightsDbContext>().DailyViews
            .Where(v => v.ListingId == listingId).SumAsync(v => v.Views);
    }

    public async Task<long?> StoredOffsetAsync(int partition)
    {
        await using var scope = _services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<InsightsDbContext>().ConsumerOffsets
            .Where(o => o.Partition == partition).Select(o => (long?)o.NextOffset).SingleOrDefaultAsync();
    }

    public async Task SetViewsAsync(string listingId, DateOnly day, long views)
    {
        await using var scope = _services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<InsightsDbContext>().Database.ExecuteSqlAsync($"""
            INSERT INTO insights.listing_daily_views ("ListingId", "Day", "Views") VALUES ({listingId}, {day}, {views})
            ON CONFLICT ("ListingId", "Day") DO UPDATE SET "Views" = EXCLUDED."Views"
            """);
    }

    public static async Task WaitUntilAsync(Func<Task<bool>> condition, string what)
    {
        var deadline = DateTime.UtcNow + WaitTimeout;
        while (DateTime.UtcNow < deadline)
        {
            if (await condition())
            {
                return;
            }
            await Task.Delay(50);
        }
        Assert.Fail($"Timed out waiting until {what}");
    }

    public async ValueTask DisposeAsync()
    {
        await _services.DisposeAsync();
        NpgsqlConnection.ClearAllPools();
        await using var admin = new NpgsqlConnection(_adminConnectionString);
        await admin.OpenAsync();
        await using var drop = new NpgsqlCommand($"""DROP DATABASE IF EXISTS "{_database}" WITH (FORCE)""", admin);
        await drop.ExecuteNonQueryAsync();
    }
}

// Fails the next transaction commits the test arms: before the commit (nothing written), or after it (written, but the
// caller is told it failed, like a lost acknowledgement).
internal sealed class CommitFaults : DbTransactionInterceptor
{
    private int _failBefore;
    private int _failAfter;

    public void FailNextCommitBeforeItLands() => Interlocked.Increment(ref _failBefore);

    public void FailNextCommitAfterItLands() => Interlocked.Increment(ref _failAfter);

    public override ValueTask<InterceptionResult> TransactionCommittingAsync(
        DbTransaction transaction, TransactionEventData eventData, InterceptionResult result, CancellationToken cancellationToken = default) =>
        TakeOne(ref _failBefore)
            ? throw new InvalidOperationException("Simulated failure before the commit")
            : ValueTask.FromResult(result);

    public override Task TransactionCommittedAsync(
        DbTransaction transaction, TransactionEndEventData eventData, CancellationToken cancellationToken = default) =>
        TakeOne(ref _failAfter)
            ? throw new InvalidOperationException("Simulated lost acknowledgement: the commit landed")
            : Task.CompletedTask;

    private static bool TakeOne(ref int armed)
    {
        while (true)
        {
            var current = Volatile.Read(ref armed);
            if (current == 0)
            {
                return false;
            }
            if (Interlocked.CompareExchange(ref armed, current - 1, current) == current)
            {
                return true;
            }
        }
    }
}

// A scope factory whose next CreateScope calls fail, like a database that's briefly unreachable.
internal sealed class FailingScopes(IServiceScopeFactory inner) : IServiceScopeFactory
{
    private int _failures;

    public int Attempts { get; private set; }

    public void FailNext(int times) => Interlocked.Exchange(ref _failures, times);

    public IServiceScope CreateScope()
    {
        Attempts++;
        if (Interlocked.Decrement(ref _failures) >= 0)
        {
            throw new NpgsqlException("Simulated: the database is unreachable");
        }
        Interlocked.Exchange(ref _failures, 0);
        return inner.CreateScope();
    }
}

// Partitions of in-memory messages and a read position per partition. Assignment happens on the first Consume after
// Subscribe (and again on a simulated rebalance), revocation inside Close, both through the projection's handlers.
internal sealed class FakeConsumer(int partitionCount) : IConsumer<string, string>
{
    private const string Topic = "listing-views";
    private readonly List<string>[] _partitions = Enumerable.Range(0, partitionCount).Select(_ => new List<string>()).ToArray();
    private readonly long[] _positions = new long[partitionCount];
    private readonly object _lock = new();
    private List<TopicPartition> _assignment = [];
    private bool _assignPending;
    private int _consumeCalls;

    public ListingViewsProjection? Projection { get; set; }

    // The Consume call (1-based) during which every partition is revoked and assigned again.
    public int? RebalanceOnConsumeCall { get; set; }

    public List<TopicPartitionOffset> Commits { get; } = [];

    public void Publish(int partition, string value)
    {
        lock (_lock)
        {
            _partitions[partition].Add(value);
        }
    }

    public List<TopicPartition> Assignment => _assignment;

    public ConsumeResult<string, string>? Consume(TimeSpan timeout)
    {
        _consumeCalls++;
        if (_assignPending || _consumeCalls == RebalanceOnConsumeCall)
        {
            if (!_assignPending)
            {
                Projection!.OnRevoked();
                _assignment = [];
            }
            _assignPending = false;
            var partitions = Enumerable.Range(0, _partitions.Length).Select(p => new TopicPartition(Topic, p)).ToList();
            foreach (var start in Projection!.OnAssigned(partitions))
            {
                _positions[start.Partition.Value] = start.Offset == Offset.Beginning ? 0 : start.Offset.Value;
            }
            _assignment = partitions;
        }

        lock (_lock)
        {
            foreach (var partition in _assignment)
            {
                var p = partition.Partition.Value;
                if (_positions[p] < _partitions[p].Count)
                {
                    var offset = _positions[p]++;
                    return new ConsumeResult<string, string>
                    {
                        TopicPartitionOffset = new TopicPartitionOffset(Topic, p, offset),
                        Message = new Message<string, string> { Key = "k", Value = _partitions[p][(int)offset] },
                    };
                }
            }
        }
        Thread.Sleep(10);
        return null;
    }

    public void Subscribe(string topic) => _assignPending = true;

    public void Seek(TopicPartitionOffset tpo) =>
        _positions[tpo.Partition.Value] = tpo.Offset == Offset.Beginning ? 0 : tpo.Offset.Value;

    public void Commit(IEnumerable<TopicPartitionOffset> offsets) => Commits.AddRange(offsets);

    public void Close()
    {
        if (_assignment.Count > 0)
        {
            Projection!.OnRevoked();
            _assignment = [];
        }
    }

    public void Dispose()
    {
    }

    public Handle Handle => throw new NotSupportedException();
    public string Name => "fake";
    public int AddBrokers(string brokers) => throw new NotSupportedException();
    public void SetSaslCredentials(string username, string password) => throw new NotSupportedException();
    public string MemberId => "fake-member";
    public List<string> Subscription => [Topic];
    public IConsumerGroupMetadata ConsumerGroupMetadata => throw new NotSupportedException();
    public ConsumeResult<string, string> Consume(int millisecondsTimeout) => throw new NotSupportedException();
    public ConsumeResult<string, string> Consume(CancellationToken cancellationToken = default) => throw new NotSupportedException();
    public void Subscribe(IEnumerable<string> topics) => throw new NotSupportedException();
    public void Unsubscribe() => throw new NotSupportedException();
    public void Assign(TopicPartition partition) => throw new NotSupportedException();
    public void Assign(TopicPartitionOffset partition) => throw new NotSupportedException();
    public void Assign(IEnumerable<TopicPartitionOffset> partitions) => throw new NotSupportedException();
    public void Assign(IEnumerable<TopicPartition> partitions) => throw new NotSupportedException();
    public void IncrementalAssign(IEnumerable<TopicPartitionOffset> partitions) => throw new NotSupportedException();
    public void IncrementalAssign(IEnumerable<TopicPartition> partitions) => throw new NotSupportedException();
    public void IncrementalUnassign(IEnumerable<TopicPartition> partitions) => throw new NotSupportedException();
    public void Unassign() => throw new NotSupportedException();
    public void StoreOffset(ConsumeResult<string, string> result) => throw new NotSupportedException();
    public void StoreOffset(TopicPartitionOffset offset) => throw new NotSupportedException();
    public List<TopicPartitionOffset> Commit() => throw new NotSupportedException();
    public void Commit(ConsumeResult<string, string> result) => throw new NotSupportedException();
    public void Pause(IEnumerable<TopicPartition> partitions) => throw new NotSupportedException();
    public void Resume(IEnumerable<TopicPartition> partitions) => throw new NotSupportedException();
    public List<TopicPartitionOffset> Committed(TimeSpan timeout) => throw new NotSupportedException();
    public List<TopicPartitionOffset> Committed(IEnumerable<TopicPartition> partitions, TimeSpan timeout) => throw new NotSupportedException();
    public Offset Position(TopicPartition partition) => throw new NotSupportedException();
    public List<TopicPartitionOffset> OffsetsForTimes(IEnumerable<TopicPartitionTimestamp> timestampsToSearch, TimeSpan timeout) => throw new NotSupportedException();
    public WatermarkOffsets GetWatermarkOffsets(TopicPartition topicPartition) => throw new NotSupportedException();
    public WatermarkOffsets QueryWatermarkOffsets(TopicPartition topicPartition, TimeSpan timeout) => throw new NotSupportedException();
}
