using Airbnb.Chat.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Airbnb.Chat.Hubs;

// Everything a browser does in chat, over one WebSocket. Every call is checked against the caller's token: a
// conversation they're not part of reads as one that doesn't exist.
[Authorize]
public sealed class ChatHub(ChatStore store, SendLimiter limiter, AutoReplies autoReplies) : Hub
{
    public const string MessageEvent = "message";
    public const string ReadEvent = "read";
    private const int MaxTextLength = 2000;
    private const int HistoryLimit = 100;
    private const int InboxLimit = 50;

    private string Me => Context.UserIdentifier!;

    private CancellationToken Aborted => Context.ConnectionAborted;

    public async Task<List<ConversationSummary>> ListConversations() =>
        [.. (await store.ListForAsync(Me, InboxLimit, Aborted)).Select(c => ConversationSummary.For(c, Me))];

    public async Task<List<ChatMessage>> GetMessages(string conversationId)
    {
        var conversation = await MemberOfAsync(conversationId);
        return [.. (await store.LatestMessagesAsync(conversation.Id, HistoryLimit, Aborted)).Select(ChatMessage.From)];
    }

    // Reaches both people's connections, on whichever instance each is connected to (the Redis backplane).
    public async Task<ChatMessage> Send(string conversationId, string? text)
    {
        var body = text?.Trim() ?? "";
        if (body.Length is 0 or > MaxTextLength)
        {
            throw new HubException($"Messages are 1 to {MaxTextLength} characters");
        }
        if (!limiter.TryAcquire(Me))
        {
            throw new HubException("You're sending messages too fast. Wait a moment.");
        }
        var conversation = await MemberOfAsync(conversationId);
        var message = ChatMessage.From(await store.AddMessageAsync(conversation, Me, body, Aborted));
        await Clients.Users(conversation.GuestId, conversation.HostId).SendAsync(MessageEvent, message, Aborted);
        if (conversation.HostIsDemo && Me == conversation.GuestId && conversation.AutoRepliedAt is null
            && await store.TryClaimAutoReplyAsync(conversation.Id, Aborted))
        {
            autoReplies.Enqueue(conversation);
        }
        return message;
    }

    // Tells the caller's other tabs too, so their unread counts clear.
    public async Task MarkRead(string conversationId)
    {
        var conversation = await MemberOfAsync(conversationId);
        await store.MarkReadAsync(conversation, Me, Aborted);
        await Clients.User(Me).SendAsync(ReadEvent, new ReadReceipt(conversation.Id), Aborted);
    }

    private async Task<Conversation> MemberOfAsync(string conversationId) =>
        await store.FindForMemberAsync(conversationId, Me, Aborted) ?? throw new HubException("Conversation not found");
}
