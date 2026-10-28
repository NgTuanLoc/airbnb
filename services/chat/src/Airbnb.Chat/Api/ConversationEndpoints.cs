using System.Security.Cryptography;
using System.Text;
using Airbnb.Chat.Data;

namespace Airbnb.Chat.Api;

public sealed record StartConversationRequest(
    string? ListingId, string? ListingTitle, string? HostId, string? HostName, string? GuestId, string? GuestName, bool HostIsDemo);

public sealed record ConversationCreatedDto(string Id);

public sealed record ErrorDto(string Code, string Error);

public static class ConversationEndpoints
{
    private const int MaxIdLength = 64;
    private const int MaxNameLength = 100;
    private const int MaxTitleLength = 200;

    // Only the Next server starts conversations: host listings live there, so only it can vouch for a listing's host.
    public static void MapConversations(this IEndpointRouteBuilder app) =>
        app.MapPost("/conversations", async (StartConversationRequest request, ChatStore store, CancellationToken ct) =>
        {
            if (!IsValid(request))
            {
                return Results.BadRequest(new ErrorDto("invalid_request", "A listing, its host and the guest are required"));
            }
            if (request.GuestId == request.HostId)
            {
                return Results.BadRequest(new ErrorDto("own_listing", "You can't message yourself"));
            }
            var conversation = await store.StartAsync(new NewConversation(
                request.ListingId!, request.ListingTitle!, request.HostId!, request.HostName!, request.GuestId!, request.GuestName!,
                request.HostIsDemo), ct);
            return Results.Ok(new ConversationCreatedDto(conversation.Id));
        }).AddEndpointFilter(RequireServiceKey);

    private static bool IsValid(StartConversationRequest r) =>
        Fits(r.ListingId, MaxIdLength) && Fits(r.HostId, MaxIdLength) && Fits(r.GuestId, MaxIdLength)
        && Fits(r.HostName, MaxNameLength) && Fits(r.GuestName, MaxNameLength) && Fits(r.ListingTitle, MaxTitleLength);

    private static bool Fits(string? value, int maxLength) => !string.IsNullOrWhiteSpace(value) && value.Length <= maxLength;

    private static async ValueTask<object?> RequireServiceKey(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var expected = http.RequestServices.GetRequiredService<IConfiguration>()["Chat:ServiceKey"];
        var presented = http.Request.Headers["X-Service-Key"].ToString();
        if (string.IsNullOrEmpty(expected) || string.IsNullOrEmpty(presented)
            || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(presented)))
        {
            return Results.Unauthorized();
        }
        return await next(context);
    }
}
