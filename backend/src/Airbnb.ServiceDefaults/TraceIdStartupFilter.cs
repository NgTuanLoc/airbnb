using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Features;

namespace Microsoft.Extensions.Hosting;

// Names each request's trace on its response (X-Trace-Id), to find the call in the dashboard's Traces when debugging.
// As a startup filter it runs first, so responses that middleware answers early (rate limits, errors) carry it too.
internal sealed class TraceIdStartupFilter : IStartupFilter
{
    public const string Header = "X-Trace-Id";

    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
    {
        app.Use((context, nextMiddleware) =>
        {
            if (context.Features.Get<IHttpActivityFeature>()?.Activity is { } activity)
            {
                var traceId = activity.TraceId.ToHexString();
                // Set as the response starts, so one that's cleared and written again (an error page) keeps it.
                context.Response.OnStarting(() =>
                {
                    context.Response.Headers[Header] = traceId;
                    return Task.CompletedTask;
                });
            }
            return nextMiddleware(context);
        });
        next(app);
    };
}
