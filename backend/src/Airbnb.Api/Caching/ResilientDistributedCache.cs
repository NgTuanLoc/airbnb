using Microsoft.Extensions.Caching.Distributed;
using Polly;
using Polly.CircuitBreaker;
using Polly.Registry;

namespace Airbnb.Api.Caching;

// Polly guard around HybridCache's Redis layer (spec §4): a slow or dead Redis becomes a cache miss
// (served from Postgres) instead of a request stalled until the Redis client times out.
internal sealed class ResilientDistributedCache(
    IDistributedCache inner,
    ResiliencePipeline pipeline,
    ILogger<ResilientDistributedCache> logger) : IDistributedCache
{
    public const string PipelineName = "redis-l2";
    public static readonly TimeSpan Timeout = TimeSpan.FromMilliseconds(250);

    // Circuit breaker outside, timeout inside, so timeouts count as failures.
    public static ResiliencePipelineBuilder Configure(ResiliencePipelineBuilder builder) => builder
        .AddCircuitBreaker(new CircuitBreakerStrategyOptions
        {
            FailureRatio = 0.5,
            SamplingDuration = TimeSpan.FromSeconds(10),
            MinimumThroughput = 10,
            BreakDuration = TimeSpan.FromSeconds(30),
        })
        .AddTimeout(Timeout);

    public byte[]? Get(string key) => Try(() => inner.Get(key));

    public Task<byte[]?> GetAsync(string key, CancellationToken token = default) =>
        TryAsync(ct => inner.GetAsync(key, ct), token);

    public void Set(string key, byte[] value, DistributedCacheEntryOptions options) =>
        Try(() => { inner.Set(key, value, options); return true; });

    public Task SetAsync(string key, byte[] value, DistributedCacheEntryOptions options, CancellationToken token = default) =>
        TryAsync(async ct => { await inner.SetAsync(key, value, options, ct); return true; }, token);

    public void Refresh(string key) => Try(() => { inner.Refresh(key); return true; });

    public Task RefreshAsync(string key, CancellationToken token = default) =>
        TryAsync(async ct => { await inner.RefreshAsync(key, ct); return true; }, token);

    public void Remove(string key) => Try(() => { inner.Remove(key); return true; });

    public Task RemoveAsync(string key, CancellationToken token = default) =>
        TryAsync(async ct => { await inner.RemoveAsync(key, ct); return true; }, token);

    private T? Try<T>(Func<T?> operation)
    {
        try
        {
            return pipeline.Execute(operation);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            LogUnavailable(exception);
            return default;
        }
    }

    private async Task<T?> TryAsync<T>(Func<CancellationToken, Task<T?>> operation, CancellationToken token)
    {
        try
        {
            // WaitAsync makes the timeout real even when the Redis client ignores the cancellation token.
            return await pipeline.ExecuteAsync(async ct => await operation(ct).WaitAsync(ct), token);
        }
        catch (Exception exception) when (exception is not OperationCanceledException || !token.IsCancellationRequested)
        {
            LogUnavailable(exception);
            return default;
        }
    }

    // An open circuit is expected while Redis is down; log it quietly instead of once per request at Warning.
    private void LogUnavailable(Exception exception)
    {
        if (exception is BrokenCircuitException)
        {
            logger.LogDebug("Redis cache circuit is open; treating as a cache miss");
        }
        else
        {
            logger.LogWarning(exception, "Redis cache unavailable; treating as a cache miss");
        }
    }
}

internal static class ResilientDistributedCacheExtensions
{
    // Wraps whatever IDistributedCache is registered (Aspire's Redis cache) with the Polly pipeline.
    public static IServiceCollection AddResilientDistributedCache(this IServiceCollection services)
    {
        services.AddResiliencePipeline(ResilientDistributedCache.PipelineName, builder => ResilientDistributedCache.Configure(builder));

        var redis = services.Last(descriptor => descriptor.ServiceType == typeof(IDistributedCache));
        services.Remove(redis);
        services.AddSingleton<IDistributedCache>(provider => new ResilientDistributedCache(
            (IDistributedCache)(redis.ImplementationInstance
                ?? redis.ImplementationFactory?.Invoke(provider)
                ?? ActivatorUtilities.CreateInstance(provider, redis.ImplementationType!)),
            provider.GetRequiredService<ResiliencePipelineProvider<string>>().GetPipeline(ResilientDistributedCache.PipelineName),
            provider.GetRequiredService<ILogger<ResilientDistributedCache>>()));

        return services;
    }
}
