using System.Net;
using System.Net.Http.Headers;

namespace Airbnb.UnitTests.Identity;

// An IHttpClientFactory whose clients answer from a function and record what they were sent.
internal sealed class StubHttpClientFactory(Func<HttpRequestMessage, HttpResponseMessage> respond) : IHttpClientFactory
{
    public List<RecordedRequest> Requests { get; } = [];

    public HttpClient CreateClient(string name) => new(new Handler(this, respond));

    internal sealed record RecordedRequest(HttpMethod Method, Uri Uri, AuthenticationHeaderValue? Authorization, string? Body);

    private sealed class Handler(StubHttpClientFactory owner, Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            owner.Requests.Add(new RecordedRequest(request.Method, request.RequestUri!, request.Headers.Authorization, body));
            return respond(request);
        }
    }

    internal static HttpResponseMessage Json(HttpStatusCode status, string json) =>
        new(status) { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };
}
