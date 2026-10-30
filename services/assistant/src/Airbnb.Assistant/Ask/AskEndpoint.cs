using System.Text.Json;
using Airbnb.Assistant.Tools;
using Microsoft.Extensions.AI;

namespace Airbnb.Assistant.Ask;

// POST /ask: one answer, streamed as NDJSON while the model writes it (assistant spec: "The assistant service").
public static class AskEndpoint
{
    public const string RateLimitPolicy = "questions";
    private const int MaxOutputTokens = 400;
    private const int MaxCards = 3;
    private const string Failure = "The assistant couldn't answer just now. Try again in a moment.";
    private static readonly TimeSpan AnswerTimeout = TimeSpan.FromMinutes(2);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static void MapAsk(this IEndpointRouteBuilder app) =>
        app.MapPost("/ask", AskAsync).RequireRateLimiting(RateLimitPolicy);

    // The services one answer uses, from the container.
    internal sealed record AnswerServices(IChatClient Chat, Prompt Prompt, CatalogTools Tools, FoundListings Found, ILogger<AnswerServices> Logger);

    private static async Task AskAsync(
        HttpContext http, AskRequest request, [AsParameters] AnswerServices services, CancellationToken cancellationToken)
    {
        var (chat, prompt, tools, found, logger) = services;
        if (request.Problem() is { } problem)
        {
            http.Response.StatusCode = StatusCodes.Status400BadRequest;
            await http.Response.WriteAsJsonAsync(new { code = "invalid_request", error = problem }, cancellationToken);
            return;
        }

        http.Response.ContentType = "application/x-ndjson";
        http.Response.Headers.CacheControl = "no-store";
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(AnswerTimeout);
        try
        {
            List<ChatMessage> messages = [new(ChatRole.System, await prompt.ForAsync(request.ListingId, timeout.Token))];
            messages.AddRange(request.Messages!.Select(m => new ChatMessage(m.Role == "user" ? ChatRole.User : ChatRole.Assistant, m.Text!.Trim())));
            var options = new ChatOptions { Tools = tools.All(), MaxOutputTokens = MaxOutputTokens, Temperature = 0.2f };

            var updates = chat.GetStreamingResponseAsync(messages, options, timeout.Token).Where(update => !string.IsNullOrEmpty(update.Text));
            await foreach (var update in updates)
            {
                await WriteAsync(http, new { type = "text", text = update.Text }, timeout.Token);
            }
            if (found.Last.Count > 0)
            {
                var listings = found.Last.Take(MaxCards).Select(l => new { id = l.Id, title = l.Title, city = l.Location.City, pricePerNight = l.PricePerNight, rating = l.Rating });
                await WriteAsync(http, new { type = "listings", listings }, timeout.Token);
            }
            await WriteAsync(http, new { type = "done" }, timeout.Token);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            // The model failed or ran out of time. The answer so far stays with the guest; the question and the answer
            // stay out of the logs.
            logger.LogError(exception, "An answer failed");
            await WriteAsync(http, new { type = "error", message = Failure }, CancellationToken.None);
        }
    }

    // One event per line, flushed straight away, so the guest sees the answer as it's written.
    private static async Task WriteAsync(HttpContext http, object @event, CancellationToken cancellationToken)
    {
        await http.Response.WriteAsync(JsonSerializer.Serialize(@event, Json) + "\n", cancellationToken);
        await http.Response.Body.FlushAsync(cancellationToken);
    }
}
