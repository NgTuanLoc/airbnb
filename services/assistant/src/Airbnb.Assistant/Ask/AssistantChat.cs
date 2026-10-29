using Microsoft.Extensions.AI;

namespace Airbnb.Assistant.Ask;

public static class AssistantChat
{
    // A question plus a couple of lookups (search, then details or a quote) fits well within this.
    public const int MaxToolRounds = 4;

    // The pipeline in front of the model: tools run automatically between the model's turns. Shared with the tests,
    // which put it in front of a scripted model instead of Ollama.
    public static ChatClientBuilder UseAssistantPipeline(this ChatClientBuilder builder) =>
        builder.UseFunctionInvocation(configure: client => client.MaximumIterationsPerRequest = MaxToolRounds);
}
