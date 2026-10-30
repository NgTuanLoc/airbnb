using Microsoft.Extensions.Caching.Memory;

namespace Airbnb.Modules.Identity;

// ponytail: in-memory per API instance, so each instance allows its own 10 attempts. Move to Redis (HybridCache) if the API scales out.
// A credential guard that doesn't depend on the client IP, which a spoofed X-Forwarded-For can rotate.
internal sealed class LoginThrottle(IMemoryCache cache, TimeProvider time)
{
    internal const int MaxFailures = 10;
    internal static readonly TimeSpan Window = TimeSpan.FromMinutes(15);

    // ponytail: one lock for every email; the critical section is a cache lookup and an increment. Per-key locks if it ever contends.
    private readonly Lock _gate = new();

    // Fixed window from the first attempt; the window is compared against TimeProvider, the cache expiry only cleans up.
    private sealed class Attempts(DateTimeOffset windowStart)
    {
        public DateTimeOffset WindowStart { get; } = windowStart;
        public int Count { get; set; }
    }

    private static string Key(string email) => $"identity:login-attempts:{email}";

    // Reserves one password check for this email, or returns false when the window's attempts are used up.
    // Counting before the (slow) password check is what keeps a concurrent burst from getting more than MaxFailures guesses.
    public bool TryBeginAttempt(string email)
    {
        var now = time.GetUtcNow();
        var key = Key(email);
        lock (_gate)
        {
            if (!cache.TryGetValue(key, out Attempts? attempts) || now - attempts!.WindowStart >= Window)
            {
                attempts = new Attempts(now);
                cache.Set(key, attempts, Window);
            }
            if (attempts.Count >= MaxFailures)
            {
                return false;
            }
            attempts.Count++;
            return true;
        }
    }

    // A successful login clears the email's attempts.
    public void Reset(string email)
    {
        lock (_gate)
        {
            cache.Remove(Key(email));
        }
    }
}
