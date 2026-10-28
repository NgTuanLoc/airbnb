using Airbnb.Chat.Data;

namespace Airbnb.Chat.Hubs;

// A conversation in someone's inbox, from their side: the other person's name and their own unread count.
public sealed record ConversationSummary(
    string Id,
    string ListingId,
    string ListingTitle,
    string OtherName,
    string Role,
    string? LastMessageText,
    DateTimeOffset? LastMessageAt,
    int Unread)
{
    public static ConversationSummary For(Conversation c, string userId) => userId == c.GuestId
        ? new(c.Id, c.ListingId, c.ListingTitle, c.HostName, "guest", c.LastMessageText, Utc(c.LastMessageAt), c.GuestUnread)
        : new(c.Id, c.ListingId, c.ListingTitle, c.GuestName, "host", c.LastMessageText, Utc(c.LastMessageAt), c.HostUnread);

    private static DateTimeOffset? Utc(DateTime? at) => at is { } value ? new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc)) : null;
}

public sealed record ChatMessage(string Id, string ConversationId, string SenderId, string Text, DateTimeOffset SentAt)
{
    public static ChatMessage From(Message m) =>
        new(m.Id, m.ConversationId, m.SenderId, m.Text, new DateTimeOffset(DateTime.SpecifyKind(m.SentAt, DateTimeKind.Utc)));
}

public sealed record ReadReceipt(string ConversationId);
