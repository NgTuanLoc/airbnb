using System.Collections.Concurrent;
using System.Net;
using System.Text;
using System.Text.Json;
using static Airbnb.Assistant.Tests.Asking;

namespace Airbnb.Assistant.Tests;

// The Ollama client Aspire's integration registers (OllamaSharp, with ServiceDefaults' HTTP handlers) against a fake
// Ollama endpoint: the scripted model can't catch a tool definition the real client fails to send, or a timeout on the
// way to the model.
public sealed class OllamaClientTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    // Ollama's /api/chat: records each request, answers with a streamed reply in the given pieces, after Delay.
    private sealed class FakeOllama(params string[] pieces) : HttpMessageHandler
    {
        public ConcurrentQueue<JsonElement> Requests { get; } = new();

        public TimeSpan Delay { get; init; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Enqueue(JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken)).RootElement.Clone());
            await Task.Delay(Delay, cancellationToken);
            var lines = pieces
                .Select(piece => JsonSerializer.Serialize(new { model = "qwen2.5:0.5b", created_at = "2030-04-20T09:00:00Z", message = new { role = "assistant", content = piece }, done = false }))
                .Append(JsonSerializer.Serialize(new { model = "qwen2.5:0.5b", created_at = "2030-04-20T09:00:01Z", message = new { role = "assistant", content = "" }, done = true, done_reason = "stop" }));
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(string.Join("\n", lines) + "\n", Encoding.UTF8, "application/x-ndjson"),
            };
        }
    }

    [Fact]
    public async Task The_real_Ollama_client_sends_the_tools_and_streams_the_reply()
    {
        var ollama = new FakeOllama("Hello", " there.");
        await using var factory = new AssistantFactory(ollama: ollama);
        using var http = factory.CreateClient();

        using var response = await AskAsync(http, Question("Hi! What can you help me with?"), Ct);
        var events = await EventsAsync(response, Ct);

        Assert.Equal(["text", "text", "done"], events.Select(TypeOf));
        var sent = Assert.Single(ollama.Requests);
        var tools = sent.GetProperty("tools").EnumerateArray().Select(t => t.GetProperty("function")).ToList();
        Assert.Equal(["search_listings", "get_listing", "quote_stay"], tools.Select(f => f.GetProperty("name").GetString()));
        // Ollama's tool format takes one type per parameter, not a list like ["string", "null"].
        foreach (var parameter in tools.SelectMany(f => f.GetProperty("parameters").GetProperty("properties").EnumerateObject()))
        {
            Assert.Equal(JsonValueKind.String, parameter.Value.GetProperty("type").ValueKind);
        }
    }

    [Fact]
    public async Task A_model_slower_to_start_than_the_default_attempt_timeout_still_answers()
    {
        // A cold model on a CPU reads the whole prompt before its first word: longer than ServiceDefaults' 10 s per
        // attempt. The answer's own timeout is the one that counts.
        var ollama = new FakeOllama("Hello.") { Delay = TimeSpan.FromSeconds(11) };
        await using var factory = new AssistantFactory(ollama: ollama);
        using var http = factory.CreateClient();

        using var response = await AskAsync(http, Question("Hi!"), Ct);

        Assert.Equal(["text", "done"], (await EventsAsync(response, Ct)).Select(TypeOf));
    }
}
