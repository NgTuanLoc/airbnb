using System.Diagnostics;
using Airbnb.Api.Caching;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging.Abstractions;
using Polly;

namespace Airbnb.UnitTests.Api;

public sealed class ResilientDistributedCacheTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_healthy_cache_passes_values_through()
    {
        var inner = new FakeCache { Value = [1, 2, 3] };

        var value = await CreateCache(inner).GetAsync("key", Ct);

        Assert.Equal([1, 2, 3], value);
    }

    [Fact]
    public async Task A_hung_cache_becomes_a_miss_within_the_timeout()
    {
        var inner = new FakeCache { Hang = true };
        var stopwatch = Stopwatch.StartNew();

        var value = await CreateCache(inner).GetAsync("key", Ct);

        Assert.Null(value);
        Assert.True(stopwatch.Elapsed < TimeSpan.FromSeconds(2), $"took {stopwatch.Elapsed}");
    }

    [Fact]
    public async Task Writes_to_a_failing_cache_are_skipped_without_throwing()
    {
        var inner = new FakeCache { Fail = true };

        await CreateCache(inner).SetAsync("key", [1], new DistributedCacheEntryOptions(), Ct);

        Assert.Equal(1, inner.Calls);
    }

    [Fact]
    public async Task Repeated_failures_open_the_circuit_so_later_calls_skip_redis()
    {
        var inner = new FakeCache { Fail = true };
        var cache = CreateCache(inner);

        for (var i = 0; i < 10; i++)
        {
            Assert.Null(await cache.GetAsync("key", Ct));
        }

        var callsWhenOpened = inner.Calls;
        Assert.Null(await cache.GetAsync("key", Ct));

        Assert.Equal(callsWhenOpened, inner.Calls);
    }

    private static ResilientDistributedCache CreateCache(IDistributedCache inner) =>
        new(inner, ResilientDistributedCache.Configure(new ResiliencePipelineBuilder()).Build(), NullLogger<ResilientDistributedCache>.Instance);

    private sealed class FakeCache : IDistributedCache
    {
        public byte[]? Value { get; init; }

        public bool Hang { get; init; }

        public bool Fail { get; init; }

        public int Calls { get; private set; }

        public byte[]? Get(string key) => throw new NotSupportedException();

        public Task<byte[]?> GetAsync(string key, CancellationToken token = default) => Respond(Value);

        public void Set(string key, byte[] value, DistributedCacheEntryOptions options) => throw new NotSupportedException();

        public Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default) =>
            Respond<byte[]>(null);

        public void Refresh(string key) => throw new NotSupportedException();

        public Task RefreshAsync(string key, CancellationToken token = default) => Respond<byte[]>(null);

        public void Remove(string key) => throw new NotSupportedException();

        public Task RemoveAsync(string key, CancellationToken token = default) => Respond<byte[]>(null);

        // Hang ignores cancellation on purpose: the StackExchange.Redis client does too.
        private Task<T?> Respond<T>(T? value)
        {
            Calls++;
            if (Hang) return new TaskCompletionSource<T?>().Task;
            if (Fail) return Task.FromException<T?>(new InvalidOperationException("redis down"));
            return Task.FromResult(value);
        }
    }
}
