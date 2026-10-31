namespace Airbnb.Api.Tests.Infrastructure;

// The envelope exactly as the API writes it, so tests pin the wire format: it names its request's trace, the id the
// X-Trace-Id header carries too.
internal static class Envelope
{
    public const string TraceIdHeader = "X-Trace-Id";

    public static string Error(HttpResponseMessage response, string error) =>
        $$"""{"success":false,"error":"{{error}}","traceId":"{{Assert.Single(response.Headers.GetValues(TraceIdHeader))}}"}""";
}
