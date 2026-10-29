using System.Threading.RateLimiting;

namespace Airbnb.Chat.Hubs;

// Messages per user per minute, per instance (two instances allow up to twice as many). Hub calls bypass ASP.NET Core's
// rate-limiting middleware, which only sees the WebSocket's opening request.
public sealed class SendLimiter : IDisposable
{
    private readonly PartitionedRateLimiter<string> _limiter;

    public SendLimiter(IConfiguration configuration)
    {
        var perMinute = configuration.GetValue("Chat:MessagesPerMinute", 30);
        _limiter = PartitionedRateLimiter.Create<string, string>(userId => RateLimitPartition.GetFixedWindowLimiter(userId, _ =>
            new FixedWindowRateLimiterOptions { PermitLimit = perMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    }

    public bool TryAcquire(string userId)
    {
        using var lease = _limiter.AttemptAcquire(userId);
        return lease.IsAcquired;
    }

    public void Dispose() => _limiter.Dispose();
}
