using Microsoft.Extensions.Caching.Memory;

namespace Airbnb.Modules.Identity;

// ponytail: in-memory per API instance, so each instance allows its own 10 failures. Move to Redis (HybridCache) if the API scales out.
// A credential guard that doesn't depend on the client IP, which a spoofed X-Forwarded-For can rotate.
internal sealed class LoginThrottle(IMemoryCache cache, TimeProvider time)
{
    internal const int MaxFailures = 10;
    internal static readonly TimeSpan Window = TimeSpan.FromMinutes(15);

    // Fixed window from the first failure; the window is compared against TimeProvider, the cache expiry only cleans up.
    private sealed record Failures(DateTimeOffset WindowStart)
    {
        public int Count;
    }

    private static string Key(string email) => $"identity:login-failures:{email}";

    public bool IsBlocked(string email) =>
        cache.TryGetValue(Key(email), out Failures? failures)
        && time.GetUtcNow() - failures!.WindowStart < Window
        && Volatile.Read(ref failures.Count) >= MaxFailures;

    public void RecordFailure(string email)
    {
        var now = time.GetUtcNow();
        var key = Key(email);
        if (!cache.TryGetValue(key, out Failures? failures) || now - failures!.WindowStart >= Window)
        {
            failures = new Failures(now);
            cache.Set(key, failures, Window);
        }
        Interlocked.Increment(ref failures.Count);
    }

    public void Reset(string email) => cache.Remove(Key(email));
}
