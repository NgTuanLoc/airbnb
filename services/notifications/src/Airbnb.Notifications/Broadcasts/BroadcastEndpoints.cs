using System.Globalization;
using Microsoft.AspNetCore.Mvc;

namespace Airbnb.Notifications.Broadcasts;

public static class BroadcastEndpoints
{
    // The AppHost's "Broadcast a message" input has the same limit.
    public const int MaxLength = 500;

    public sealed record BroadcastRequest(string? Text);

    public static void MapBroadcasts(this IEndpointRouteBuilder app)
    {
        // Every open page listens here (through the Next server), as Server-Sent Events. The browser sends the last id it
        // saw when it reconnects, and gets the broadcasts it missed first.
        app.MapGet("/events", IResult (BroadcastHub hub, [FromHeader(Name = "Last-Event-ID")] string? lastEventId,
            CancellationToken cancellationToken) =>
        {
            if (hub.Listeners >= hub.MaxListeners)
            {
                return TypedResults.StatusCode(StatusCodes.Status503ServiceUnavailable);
            }
            long? seen = long.TryParse(lastEventId, CultureInfo.InvariantCulture, out var id) ? id : null;
            return TypedResults.ServerSentEvents(hub.ListenAsync(seen, cancellationToken));
        });

        // "Broadcast a message" (an AppHost dashboard command): shows the text on every open page right away.
        app.MapPost("/broadcasts", IResult (IConfiguration configuration, BroadcastHub hub,
            [FromHeader(Name = AdminKey.Header)] string? key, BroadcastRequest? request) =>
        {
            if (AdminKey.Check(configuration, key) is { } refused)
            {
                return refused;
            }
            var text = request?.Text?.Trim();
            if (string.IsNullOrEmpty(text) || text.Length > MaxLength)
            {
                return TypedResults.BadRequest(new { code = "invalid_message", error = $"The message must be 1 to {MaxLength} characters." });
            }
            var (broadcast, listeners) = hub.Publish(text);
            return TypedResults.Ok(new { broadcast.Id, broadcast.SentAt, listeners });
        });
    }
}
