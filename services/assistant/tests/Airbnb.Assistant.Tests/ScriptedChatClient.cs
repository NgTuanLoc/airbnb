using System.Runtime.CompilerServices;
using Microsoft.Extensions.AI;

namespace Airbnb.Assistant.Tests;

// The model, scripted: each call to the client plays the next turn (text pieces, tool calls, or a failure) and records
// the messages it was sent, so tests can see the prompt and the tool results the real pipeline fed back.
public sealed class ScriptedChatClient(params ScriptedChatClient.Turn[] turns) : IChatClient
{
    public abstract record Turn;

    public sealed record Says(params string[] Pieces) : Turn;

    public sealed record Calls(params FunctionCallContent[] Functions) : Turn;

    public sealed record Fails(Exception Exception) : Turn;

    private readonly Queue<Turn> _turns = new(turns);

    public List<IReadOnlyList<ChatMessage>> Received { get; } = [];

    public static FunctionCallContent Call(string name, Dictionary<string, object?> arguments) =>
        new($"call_{Guid.NewGuid():N}", name, arguments);

    public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages, ChatOptions? options = null, [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        Received.Add([.. messages]);
        var turn = _turns.Count > 0 ? _turns.Dequeue() : new Says("(no more turns)");
        switch (turn)
        {
            case Says says:
                foreach (var piece in says.Pieces)
                {
                    await Task.Yield();
                    yield return new ChatResponseUpdate(ChatRole.Assistant, piece);
                }
                break;
            case Calls calls:
                yield return new ChatResponseUpdate(ChatRole.Assistant, [.. calls.Functions]);
                break;
            case Fails fails:
                throw fails.Exception;
        }
    }

    public async Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
    {
        var updates = new List<ChatResponseUpdate>();
        await foreach (var update in GetStreamingResponseAsync(messages, options, cancellationToken))
        {
            updates.Add(update);
        }
        return updates.ToChatResponse();
    }

    public object? GetService(Type serviceType, object? serviceKey = null) => serviceType.IsInstanceOfType(this) ? this : null;

    public void Dispose()
    {
    }

    // The tool results the pipeline sent back to the model on the given call (0-based).
    public IEnumerable<string> ToolResultsSentOn(int call) =>
        Received[call].SelectMany(m => m.Contents).OfType<FunctionResultContent>().Select(r => r.Result?.ToString() ?? "");
}
