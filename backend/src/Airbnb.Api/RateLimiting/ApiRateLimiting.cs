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
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    public static IServiceCollection AddApiRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(SectionName);
        var readsPerMinute = section.GetValue("ReadsPerMinute", DefaultReadsPerMinute);
        var writesPerMinute = section.GetValue("WritesPerMinute", DefaultWritesPerMinute);
        var viewsPerMinute = section.GetValue("ViewsPerMinute", DefaultViewsPerMinute);

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
                var (bucket, limit) = context.GetEndpoint()?.Metadata.GetMetadata<RateLimitBucket>() == RateLimitBucket.Views
                    ? (RateLimitBucket.Views.Name, viewsPerMinute)
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
