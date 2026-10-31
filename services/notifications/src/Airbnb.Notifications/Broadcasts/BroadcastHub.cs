using System.Globalization;
using System.Net.ServerSentEvents;
using System.Runtime.CompilerServices;
using System.Threading.Channels;

namespace Airbnb.Notifications.Broadcasts;

// One announcement, as every open page receives it.
public sealed record Broadcast(long Id, string Text, DateTimeOffset SentAt);

// Fans each broadcast out to every open event stream, and keeps the last few, so a page that reconnects with its
// Last-Event-ID gets what it missed.
// ponytail: in memory, so one notifications instance; with replicas, carry broadcasts over the broker (a fanout exchange).
public sealed class BroadcastHub(TimeProvider time, IConfiguration configuration)
{
    public const string EventType = "broadcast";
    // The broadcasts sent before a page opened: its history, not news.
    public const string RecentType = "recent";
    public const string PingType = "ping";
    private const int Replayable = 20;
    // A page that reads slowly loses its oldest unread broadcasts instead of holding up the others.
    private const int UnreadPerPage = 16;
    private const int DefaultMaxListeners = 1000;
    private static readonly TimeSpan DefaultHeartbeat = TimeSpan.FromSeconds(30);

    private readonly Lock _gate = new();
    private readonly List<ChannelWriter<Broadcast>> _listeners = [];
    private readonly Queue<Broadcast> _recent = new();
    private readonly TimeSpan _heartbeat = configuration.GetValue("Notifications:HeartbeatInterval", DefaultHeartbeat);
    private long _lastId;

    // Every open stream holds a connection and a little memory: past this many, new pages are turned away.
    public int MaxListeners { get; } = configuration.GetValue("Notifications:MaxListeners", DefaultMaxListeners);

    public int Listeners
    {
        get
        {
            lock (_gate)
            {
                return _listeners.Count;
            }
        }
    }

    // Sends the text to every open stream. Returns the broadcast and how many streams it went to.
    public (Broadcast Broadcast, int Listeners) Publish(string text)
    {
        lock (_gate)
        {
            var now = time.GetUtcNow();
            // Ids follow the clock, so they keep rising across restarts and a page's Last-Event-ID stays comparable.
            _lastId = Math.Max(now.ToUnixTimeMilliseconds(), _lastId + 1);
            var broadcast = new Broadcast(_lastId, text, now);
            _recent.Enqueue(broadcast);
            if (_recent.Count > Replayable)
            {
                _recent.Dequeue();
            }
            foreach (var listener in _listeners)
            {
                listener.TryWrite(broadcast);
            }
            return (broadcast, _listeners.Count);
        }
    }

    // One page's stream. First what came before: a page that just opened gets the recent broadcasts as its history
    // (recent), and one that reconnects with the last id it saw gets the ones it missed as news (broadcast). Then each
    // new one as it's sent, with a ping whenever it has been quiet for the heartbeat interval, so nothing on the way (the
    // Next server's fetch gives up on a body silent for five minutes) closes it.
    public async IAsyncEnumerable<SseItem<Broadcast?>> ListenAsync(long? lastEventId, [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var listener = Channel.CreateBounded<Broadcast>(
            new BoundedChannelOptions(UnreadPerPage) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true });
        Broadcast[] earlier;
        lock (_gate)
        {
            _listeners.Add(listener.Writer);
            earlier = lastEventId is { } seen ? [.. _recent.Where(b => b.Id > seen)] : [.. _recent];
        }
        var earlierType = lastEventId is null ? RecentType : EventType;
        try
        {
            foreach (var broadcast in earlier)
            {
                yield return Item(broadcast, earlierType);
            }
            // Until the page goes away (the request is aborted).
            while (!cancellationToken.IsCancellationRequested)
            {
                if (!await WaitAsync(listener.Reader, cancellationToken))
                {
                    yield return new SseItem<Broadcast?>(null, PingType);
                    continue;
                }
                while (listener.Reader.TryRead(out var broadcast))
                {
                    yield return Item(broadcast, EventType);
                }
            }
        }
        finally
        {
            lock (_gate)
            {
                _listeners.Remove(listener.Writer);
            }
        }
    }

    // True once there's a broadcast to read; false when the heartbeat interval passes first.
    private async Task<bool> WaitAsync(ChannelReader<Broadcast> reader, CancellationToken cancellationToken)
    {
        using var heartbeat = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        heartbeat.CancelAfter(_heartbeat);
        try
        {
            return await reader.WaitToReadAsync(heartbeat.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return false;
        }
    }

    private static SseItem<Broadcast?> Item(Broadcast broadcast, string type) =>
        new(broadcast, type) { EventId = broadcast.Id.ToString(CultureInfo.InvariantCulture) };
}
