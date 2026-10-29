using System.Text.RegularExpressions;

namespace Airbnb.Assistant.Ask;

public sealed record AskMessage(string? Role, string? Text);

// The conversation so far, as the open page keeps it (the service stores nothing), and the listing the guest is on.
public sealed partial record AskRequest(List<AskMessage>? Messages, string? ListingId)
{
    public const int MaxMessages = 10;
    public const int MaxTextLength = 1000;

    [GeneratedRegex(@"^(l\d+|hl-[0-9a-f-]{36})$")]
    private static partial Regex ListingIdPattern();

    // Null when the request can be answered; otherwise why not.
    public string? Problem()
    {
        if (Messages is not { Count: > 0 and <= MaxMessages })
        {
            return $"Send 1 to {MaxMessages} messages";
        }
        foreach (var message in Messages)
        {
            if (message.Role is not ("user" or "assistant"))
            {
                return "Each message is from the user or the assistant";
            }
            if (string.IsNullOrWhiteSpace(message.Text) || message.Text.Length > MaxTextLength)
            {
                return $"Each message is 1 to {MaxTextLength} characters";
            }
        }
        if (Messages[^1].Role != "user")
        {
            return "The last message is the user's question";
        }
        if (ListingId is not null && !ListingIdPattern().IsMatch(ListingId))
        {
            return "That isn't a listing id";
        }
        return null;
    }
}
