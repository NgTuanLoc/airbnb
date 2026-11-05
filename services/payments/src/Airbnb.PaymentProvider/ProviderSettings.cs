namespace Airbnb.PaymentProvider;

// Missing keys fail at startup: without them nothing can be charged or reported.
public sealed record ProviderSettings(string ApiKey, Uri WebhookUrl, string WebhookSecret, TimeSpan SlowCardDelay, TimeSpan WebhookRetryDelay)
{
    public static ProviderSettings From(IConfiguration configuration) => new(
        Required(configuration, "Provider:ApiKey"),
        new Uri(Required(configuration, "Provider:WebhookUrl")),
        Required(configuration, "Provider:WebhookSecret"),
        configuration.GetValue("Provider:SlowCardDelay", TimeSpan.FromSeconds(10)),
        configuration.GetValue("Provider:WebhookRetryDelay", TimeSpan.FromSeconds(1)));

    private static string Required(IConfiguration configuration, string key) =>
        configuration[key] is { Length: > 0 } value ? value : throw new InvalidOperationException($"{key} is required");
}
