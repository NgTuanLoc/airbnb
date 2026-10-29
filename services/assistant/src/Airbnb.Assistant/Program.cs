using System.Threading.RateLimiting;
using Airbnb.Assistant.Ask;
using Airbnb.Assistant.Tools;
using Microsoft.AspNetCore.HttpOverrides;

// The assistant (docs/superpowers/specs/2026-10-29-assistant-design.md): answers guests' questions with the AppHost's
// Ollama model, grounded by read-only tools over the Next server's public catalog. Stateless: the page sends the
// conversation each time.
var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddSingleton(TimeProvider.System);

// Aspire's Ollama client integration (connection "assistant-model"), with tools run between the model's turns.
builder.AddOllamaApiClient("assistant-model").AddChatClient().UseAssistantPipeline();

var catalogUrl = builder.Configuration["Assistant:CatalogUrl"]
    ?? throw new InvalidOperationException("Assistant:CatalogUrl is required: the Next server's address");
builder.Services.AddMemoryCache();
var catalogHttp = builder.Services.AddHttpClient<CatalogClient>(client =>
{
    client.BaseAddress = new Uri(catalogUrl);
    client.Timeout = TimeSpan.FromSeconds(10);
});
// No retries: a failed lookup is told to the model at once (it says it can't check) instead of keeping the guest
// waiting through a retry schedule. The API is marked for evaluation (EXTEXP0001); the alternative is that wait.
#pragma warning disable EXTEXP0001
catalogHttp.RemoveAllResilienceHandlers();
#pragma warning restore EXTEXP0001
builder.Services.AddScoped<FoundListings>();
builder.Services.AddScoped<CatalogTools>();
builder.Services.AddTransient<Prompt>();

// Answers cost a model run each: a few a minute per browser IP (forwarded by the Next server in front).
var questionsPerMinute = builder.Configuration.GetValue("Assistant:QuestionsPerMinute", 10);
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(AskEndpoint.RateLimitPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = questionsPerMinute, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

// The browser's IP from X-Forwarded-For, trusted only from loopback proxies (the default): the Next server.
app.UseForwardedHeaders(new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.XForwardedFor });
app.UseRateLimiter();
app.MapDefaultEndpoints();
app.MapAsk();

await app.RunAsync();
