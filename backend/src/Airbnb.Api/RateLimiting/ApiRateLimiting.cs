using System.Threading.RateLimiting;

namespace Airbnb.Api.RateLimiting;

internal static class ApiRateLimiting
{
    public const string SectionName = "RateLimiting";

    // Only the public API is limited; health probes and API docs are not.
    private const string LimitedPathPrefix = "/api";
    private const int DefaultReadsPerMinute = 600;
    private const int DefaultWritesPerMinute = 10;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    public static IServiceCollection AddApiRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var section = configuration.GetSection(SectionName);
        var readsPerMinute = section.GetValue("ReadsPerMinute", DefaultReadsPerMinute);
        var writesPerMinute = section.GetValue("WritesPerMinute", DefaultWritesPerMinute);

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
                // ponytail: keyed by client IP. Behind the Next.js server every browser shares its IP (spec §2);
                // forward client IPs from Next to make this per-user.
                var client = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";

                return RateLimitPartition.GetFixedWindowLimiter(
                    $"{client}:{(isRead ? "read" : "write")}",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = isRead ? readsPerMinute : writesPerMinute,
                        Window = Window,
                    });
            });
        });
    }
}
