using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;

namespace Airbnb.Chat.Data;

// One guest's conversation with a listing's host. Names and the listing title are snapshots the Next server vouched for.
[BsonIgnoreExtraElements]
public sealed class Conversation
{
    public required string Id { get; init; }
    public required string ListingId { get; init; }
    public required string ListingTitle { get; init; }
    public required string HostId { get; init; }
    public required string HostName { get; init; }
    public required string GuestId { get; init; }
    public required string GuestName { get; init; }
    // A seed listing's host: no account behind it, so the service answers for it once (demo hosts).
    public required bool HostIsDemo { get; init; }
    public required DateTime CreatedAt { get; init; }
    // Creation, then each message: what the inbox sorts by.
    public required DateTime UpdatedAt { get; init; }
    public string? LastMessageText { get; init; }
    public DateTime? LastMessageAt { get; init; }
    public int GuestUnread { get; init; }
    public int HostUnread { get; init; }
    public DateTime? AutoRepliedAt { get; init; }

    public bool Has(string userId) => userId == GuestId || userId == HostId;
}

[BsonIgnoreExtraElements]
public sealed class Message
{
    public required string Id { get; init; }
    public required string ConversationId { get; init; }
    public required string SenderId { get; init; }
    public required string Text { get; init; }
    public required DateTime SentAt { get; init; }
}

public sealed record NewConversation(
    string ListingId, string ListingTitle, string HostId, string HostName, string GuestId, string GuestName, bool HostIsDemo);

// MongoDB: a conversation and its messages are documents read whole, with no joins (chat spec: "Storage").
public sealed class ChatStore(IMongoDatabase database, TimeProvider time)
{
    private readonly IMongoCollection<Conversation> _conversations = database.GetCollection<Conversation>("conversations");
    private readonly IMongoCollection<Message> _messages = database.GetCollection<Message>("messages");

    private static string NewId(string prefix) => prefix + Guid.CreateVersion7().ToString("N");

    public async Task EnsureIndexesAsync(CancellationToken cancellationToken)
    {
        var conversation = Builders<Conversation>.IndexKeys;
        await _conversations.Indexes.CreateManyAsync(
        [
            // One conversation per guest per listing: concurrent starts collide here.
            new CreateIndexModel<Conversation>(conversation.Ascending(c => c.ListingId).Ascending(c => c.GuestId), new CreateIndexOptions { Unique = true }),
            new CreateIndexModel<Conversation>(conversation.Ascending(c => c.GuestId).Descending(c => c.UpdatedAt)),
            new CreateIndexModel<Conversation>(conversation.Ascending(c => c.HostId).Descending(c => c.UpdatedAt)),
        ], cancellationToken);
        await _messages.Indexes.CreateOneAsync(
            new CreateIndexModel<Message>(Builders<Message>.IndexKeys.Ascending(m => m.ConversationId).Descending(m => m.SentAt)),
            cancellationToken: cancellationToken);
    }

    // The guest's conversation about the listing, created on first use. Two concurrent starts both get the one that won.
    public async Task<Conversation> StartAsync(NewConversation start, CancellationToken cancellationToken)
    {
        if (await FindAsync(start.ListingId, start.GuestId, cancellationToken) is { } existing)
        {
            return existing;
        }
        var now = time.GetUtcNow().UtcDateTime;
        var conversation = new Conversation
        {
            Id = NewId("cv_"),
            ListingId = start.ListingId,
            ListingTitle = start.ListingTitle,
            HostId = start.HostId,
            HostName = start.HostName,
            GuestId = start.GuestId,
            GuestName = start.GuestName,
            HostIsDemo = start.HostIsDemo,
            CreatedAt = now,
            UpdatedAt = now,
        };
        try
        {
            await _conversations.InsertOneAsync(conversation, cancellationToken: cancellationToken);
            return conversation;
        }
        catch (MongoWriteException exception) when (exception.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            return (await FindAsync(start.ListingId, start.GuestId, cancellationToken))!;
        }
    }

    private async Task<Conversation?> FindAsync(string listingId, string guestId, CancellationToken cancellationToken) =>
        await _conversations.Find(c => c.ListingId == listingId && c.GuestId == guestId).FirstOrDefaultAsync(cancellationToken);

    // Null for a conversation the user isn't part of, exactly as for one that doesn't exist.
    public async Task<Conversation?> FindForMemberAsync(string conversationId, string userId, CancellationToken cancellationToken) =>
        await _conversations.Find(c => c.Id == conversationId && (c.GuestId == userId || c.HostId == userId))
            .FirstOrDefaultAsync(cancellationToken);

    public Task<List<Conversation>> ListForAsync(string userId, int limit, CancellationToken cancellationToken) =>
        _conversations.Find(c => c.GuestId == userId || c.HostId == userId)
            .SortByDescending(c => c.UpdatedAt)
            .Limit(limit)
            .ToListAsync(cancellationToken);

    // The latest messages, oldest first.
    public async Task<List<Message>> LatestMessagesAsync(string conversationId, int limit, CancellationToken cancellationToken)
    {
        var latest = await _messages.Find(m => m.ConversationId == conversationId)
            .SortByDescending(m => m.SentAt)
            .Limit(limit)
            .ToListAsync(cancellationToken);
        latest.Reverse();
        return latest;
    }

    // Two writes, not one transaction (a standalone MongoDB has none): a message whose conversation update failed is
    // still in the thread, just not yet in the inbox's preview and counts.
    public async Task<Message> AddMessageAsync(Conversation conversation, string senderId, string text, CancellationToken cancellationToken)
    {
        var message = new Message
        {
            Id = NewId("msg_"),
            ConversationId = conversation.Id,
            SenderId = senderId,
            Text = text,
            SentAt = time.GetUtcNow().UtcDateTime,
        };
        await _messages.InsertOneAsync(message, cancellationToken: cancellationToken);
        var update = Builders<Conversation>.Update
            .Set(c => c.UpdatedAt, message.SentAt)
            .Set(c => c.LastMessageAt, message.SentAt)
            .Set(c => c.LastMessageText, text);
        update = senderId == conversation.GuestId ? update.Inc(c => c.HostUnread, 1) : update.Inc(c => c.GuestUnread, 1);
        await _conversations.UpdateOneAsync(c => c.Id == conversation.Id, update, cancellationToken: cancellationToken);
        return message;
    }

    // True for exactly one caller per conversation, whichever instance it runs on: the demo host answers once.
    public async Task<bool> TryClaimAutoReplyAsync(string conversationId, CancellationToken cancellationToken)
    {
        var claimed = await _conversations.UpdateOneAsync(
            c => c.Id == conversationId && c.AutoRepliedAt == null,
            Builders<Conversation>.Update.Set(c => c.AutoRepliedAt, time.GetUtcNow().UtcDateTime),
            cancellationToken: cancellationToken);
        return claimed.ModifiedCount == 1;
    }

    public Task MarkReadAsync(Conversation conversation, string userId, CancellationToken cancellationToken) =>
        _conversations.UpdateOneAsync(
            c => c.Id == conversation.Id,
            userId == conversation.GuestId
                ? Builders<Conversation>.Update.Set(c => c.GuestUnread, 0)
                : Builders<Conversation>.Update.Set(c => c.HostUnread, 0),
            cancellationToken: cancellationToken);
}
