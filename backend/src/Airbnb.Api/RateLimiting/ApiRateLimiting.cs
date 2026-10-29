using System.Threading.RateLimiting;
using Airbnb.SharedKernel;

namespace Airbnb.Api.RateLimiting;

internal static class ApiRateLimiting
{
    public const string SectionName = "RateLimiting";

    // Only the public API is limited; health probes and API docs are not.
    private const string LimitedPathPrefix = "/api";
    private const int DefaultReadsPerMinute = 600;
    private const int DefaultWritesPerMinute = 10;
    private const int DefaultViewsPerMinute = 120;
    private const int DefaultChatTokensPerMinute = 120;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    public static IServiceCollection AddApiRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(SectionName);
        var readsPerMinute = section.GetValue("ReadsPerMinute", DefaultReadsPerMinute);
        var writesPerMinute = section.GetValue("WritesPerMinute", DefaultWritesPerMinute);
        // The buckets an endpoint can claim (RateLimitBucket metadata), each with its own per-IP budget.
        var ownBuckets = new Dictionary<RateLimitBucket, int>
        {
            [RateLimitBucket.Views] = section.GetValue("ViewsPerMinute", DefaultViewsPerMinute),
            [RateLimitBucket.ChatTokens] = section.GetValue("ChatTokensPerMinute", DefaultChatTokensPerMinute),
        };

        return services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
            {
                if (!context.Request.Path.StartsWithSegments(LimitedPathPrefix))
                {
                    return RateLimitPartition.GetNoLimiter(string.Empty);
                }

                var isRead = HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method);
                // An endpoint can claim its own bucket (RateLimitBucket metadata); everything else is a read or a write.
                var claimed = context.GetEndpoint()?.Metadata.GetMetadata<RateLimitBucket>();
                var (bucket, limit) = claimed is not null && ownBuckets.TryGetValue(claimed, out var own)
                    ? (claimed.Name, own)
                    : isRead ? ("read", readsPerMinute) : ("write", writesPerMinute);
                // The browser's IP: UseForwardedHeaders resolves X-Forwarded-For from the local Next.js server.
                var client = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";

                return RateLimitPartition.GetFixedWindowLimiter(
                    $"{client}:{bucket}",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = limit,
                        Window = Window,
                    });
            });
        });
    }
}
