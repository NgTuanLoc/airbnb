using Confluent.Kafka;
using Confluent.Kafka.Admin;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Airbnb.Modules.Insights;

// Creates the listing-views topic before the API takes requests: a first view would otherwise auto-create it with the
// broker's defaults (one partition, a week's retention). Kept forever, because the log is the source of truth and the
// counts are only a view of it, rebuilt from the start on demand.
internal sealed class ListingViewsTopic(IProducer<string, string> producer, ILogger<ListingViewsTopic> logger) : IHostedService
{
    public const string Name = "listing-views";
    private const int Partitions = 3;
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var admin = new DependentAdminClientBuilder(producer.Handle).Build();
        try
        {
            await admin.CreateTopicsAsync(
                [new TopicSpecification
                {
                    Name = Name,
                    NumPartitions = Partitions,
                    ReplicationFactor = 1,
                    Configs = new Dictionary<string, string> { ["retention.ms"] = "-1" },
                }],
                new CreateTopicsOptions { RequestTimeout = Timeout, OperationTimeout = Timeout });
            logger.LogInformation("Created the {Topic} topic", Name);
        }
        catch (CreateTopicsException exception) when (exception.Results.All(r => r.Error.Code == ErrorCode.TopicAlreadyExists))
        {
            // Every start after the first.
        }
        catch (KafkaException exception)
        {
            // The API still serves pages without Kafka; views are lost until it's back.
            logger.LogWarning(exception, "Couldn't create the {Topic} topic", Name);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
