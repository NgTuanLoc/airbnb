using System.Net.Http.Json;
using System.Text.Json;
using Airbnb.Assistant.Ask;
using Airbnb.Assistant.Tools;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;

namespace Airbnb.Assistant.Tests;

// The service with a given model (scripted, or the real Ollama client on a fake endpoint) and a fake catalog in place of
// Ollama and the Next server. The rest is real: the
// function-invocation pipeline, the tools, the prompt, the stream.
public sealed class AssistantFactory(IChatClient model, FakeCatalog? catalog = null, int questionsPerMinute = 1000) : WebApplicationFactory<Program>
{
    public static readonly DateTimeOffset Today = new(2030, 4, 20, 9, 0, 0, TimeSpan.Zero);

    public FakeCatalog Catalog { get; } = catalog ?? new FakeCatalog();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder
            // Never contacted: the scripted model replaces the Ollama client the integration registers.
            .UseSetting("ConnectionStrings:assistant-model", "Endpoint=http://localhost:1;Model=test")
            .UseSetting("Assistant:CatalogUrl", "http://catalog.test")
            .UseSetting("Assistant:QuestionsPerMinute", questionsPerMinute.ToString());
        builder.ConfigureTestServices(services =>
        {
            services.AddChatClient(model).UseAssistantPipeline();
            services.AddHttpClient<CatalogClient>().ConfigurePrimaryHttpMessageHandler(() => Catalog);
            services.AddSingleton<TimeProvider>(new FixedTime(Today));
        });
    }

    private sealed class FixedTime(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}

public static class Asking
{
    public static object Question(string text, string? listingId = null) => new
    {
        messages = new[] { new { role = "user", text } },
        listingId,
    };

    // The NDJSON answer, one parsed event per line.
    public static async Task<List<JsonElement>> EventsAsync(HttpResponseMessage response, CancellationToken ct)
    {
        var body = await response.Content.ReadAsStringAsync(ct);
        return [.. body.Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(line => JsonDocument.Parse(line).RootElement)];
    }

    public static string TypeOf(JsonElement e) => e.GetProperty("type").GetString()!;

    public static async Task<HttpResponseMessage> AskAsync(HttpClient client, object body, CancellationToken ct) =>
        await client.PostAsJsonAsync("/ask", body, ct);
}
