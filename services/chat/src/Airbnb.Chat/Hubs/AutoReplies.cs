using System.Threading.Channels;
using Airbnb.Chat.Data;
using Microsoft.AspNetCore.SignalR;

namespace Airbnb.Chat.Hubs;

// Demo hosts (seed listings, no account behind them) answer a guest's first message once, after a short pause, live
// through the hub, so one person can see a reply arrive.
// ponytail: an in-memory queue, so a reply queued just before a restart is lost; a durable queue if it ever matters.
public sealed class AutoReplies(ChatStore store, IHubContext<ChatHub> hub, TimeProvider time, IConfiguration configuration, ILogger<AutoReplies> logger)
    : BackgroundService
{
    private readonly Channel<Conversation> _queue = Channel.CreateUnbounded<Conversation>();

    private TimeSpan Delay => configuration.GetValue("Chat:AutoReplyDelay", TimeSpan.FromSeconds(1.5));

    public void Enqueue(Conversation conversation) => _queue.Writer.TryWrite(conversation);

    public static string TextFor(Conversation conversation) =>
        $"Hi {conversation.GuestName}, thanks for your message about {conversation.ListingTitle}! I'm a demo host, so this " +
        "reply is automatic. To chat for real, create a listing with another account and message it.";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var conversation in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                await Task.Delay(Delay, time, stoppingToken);
                var reply = ChatMessage.From(await store.AddMessageAsync(conversation, conversation.HostId, TextFor(conversation), stoppingToken));
                await hub.Clients.Users(conversation.GuestId, conversation.HostId).SendAsync(ChatHub.MessageEvent, reply, stoppingToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogError(exception, "The demo reply in conversation {ConversationId} failed", conversation.Id);
            }
        }
    }
}
