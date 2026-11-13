namespace Airbnb.AppHost;

// The backing services every part of the app shares: databases, cache, brokers, storage, mail.
// Container lifetimes are persistent so `aspire run` keeps their data between runs; the local cluster keeps it in
// persistent volumes instead (LocalCluster.UsePersistentVolumes).
internal sealed record Infrastructure(
    IResourceBuilder<PostgresServerResource> Postgres,
    IResourceBuilder<PostgresDatabaseResource> Db,
    IResourceBuilder<RedisResource> Redis,
    IResourceBuilder<IResourceWithConnectionString> Messaging,
    IResourceBuilder<KafkaServerResource> Kafka,
    IResourceBuilder<MongoDBServerResource> Mongo,
    IResourceBuilder<MailPitContainerResource> Mailpit,
    PhotoStorage Storage);

// Blob Storage for host photo uploads: the `blobs` connection, and the resource to wait on before using it.
internal sealed record PhotoStorage(IResourceBuilder<IResourceWithConnectionString> Blobs, IResourceBuilder<IResource> Server);

internal static class InfrastructureExtensions
{
    public static Infrastructure AddInfrastructure(this IDistributedApplicationBuilder builder)
    {
        var postgres = builder.AddPostgres("postgres")
            .WithDataVolume()
            .WithLifetime(ContainerLifetime.Persistent)
            .WithPgWeb();

        var redis = builder.AddRedis("redis")
            .WithLifetime(ContainerLifetime.Persistent);

        // Listing views (Insights module): the listing-views topic, browsable in Kafka UI. A data volume, so the log
        // outlives runs and "Rebuild view stats" has history to replay.
        var kafka = builder.AddKafka("kafka")
            .WithKafkaUI(ui => ui.WithLifetime(ContainerLifetime.Persistent))
            .WithDataVolume()
            .WithLifetime(ContainerLifetime.Persistent);

        // The chat service's store, browsable in Mongo Express. GLIBC_TUNABLES: MongoDB 8's tcmalloc breaks on Linux
        // 6.19+'s rseq changes (SERVER-121912) and the image hands rseq to tcmalloc (rseq=0); rseq=1 keeps it in glibc,
        // so tcmalloc runs without it.
        var mongo = builder.AddMongoDB("mongo")
            .WithEnvironment("GLIBC_TUNABLES", "glibc.pthread.rseq=1")
            .WithDataVolume()
            .WithLifetime(ContainerLifetime.Persistent)
            .WithMongoExpress(express => express.WithLifetime(ContainerLifetime.Persistent));

        // A fake inbox with a web UI: the notification service's emails land here.
        var mailpit = builder.AddMailPit("mailpit")
            .WithLifetime(ContainerLifetime.Persistent)
            .OnLocalClusterPort(LocalCluster.MailpitPort);

        return new Infrastructure(postgres, postgres.AddDatabase("airbnb"), redis, builder.AddMessaging(), kafka, mongo,
            mailpit, builder.AddPhotoStorage());
    }

    // Wolverine's AMQP broker. Both speak AMQP 0-9-1 and appear as the "messaging" connection, so the API never knows
    // which one it got: LavinMQ by default, RabbitMQ with Messaging:Broker = RabbitMQ (appsettings.json). LavinMQ's
    // integration takes fixed host ports: 5672 (AMQP) and 15672 (its management UI).
    private static IResourceBuilder<IResourceWithConnectionString> AddMessaging(this IDistributedApplicationBuilder builder)
    {
        var broker = builder.Configuration["Messaging:Broker"] ?? "LavinMQ";
        return broker.ToLowerInvariant() switch
        {
            "lavinmq" => builder.AddLavinMQ("messaging")
                .WithLifetime(ContainerLifetime.Persistent),
            "rabbitmq" => builder.AddRabbitMQ("messaging")
                .WithManagementPlugin()
                .WithLifetime(ContainerLifetime.Persistent),
            _ => throw new InvalidOperationException($"Messaging:Broker must be LavinMQ or RabbitMQ, not '{broker}'"),
        };
    }

    // Originals and processed photos. `aspire run`: Aspire's Azure Storage emulator. The local cluster has no Azure
    // to provision an account in, so it runs Azurite itself, with an account key generated for the deployment.
    private static PhotoStorage AddPhotoStorage(this IDistributedApplicationBuilder builder)
    {
        if (!builder.IsLocalCluster())
        {
            var storage = builder.AddAzureStorage("storage")
                .RunAsEmulator(azurite => azurite.WithDataVolume().WithLifetime(ContainerLifetime.Persistent));
            return new PhotoStorage(storage.AddBlobs("blobs"), storage);
        }

        // Letters and digits only: a 64-character string of them is valid base64, which is what Azurite and the
        // storage SDKs expect an account key to be.
        var accountKey = builder.AddGeneratedKey("storage-account-key", minLength: 64);
        var azurite = builder.AddContainer("storage", "mcr.microsoft.com/azure-storage/azurite", "3.35.0")
            .WithArgs("azurite", "--blobHost", "0.0.0.0", "--queueHost", "0.0.0.0", "--tableHost", "0.0.0.0", "--skipApiVersionCheck")
            .WithEnvironment("AZURITE_ACCOUNTS", ReferenceExpression.Create($"{LocalCluster.StorageAccount}:{accountKey}"))
            .WithEndpoint(targetPort: 10000, name: "blob", scheme: "http")
            .WithEndpoint(targetPort: 10001, name: "queue", scheme: "http")
            .WithEndpoint(targetPort: 10002, name: "table", scheme: "http")
            .WithVolume("storage-data", "/data");
        var connection = ReferenceExpression.Create(
            $"DefaultEndpointsProtocol=http;AccountName={LocalCluster.StorageAccount};AccountKey={accountKey};"
            + $"BlobEndpoint={azurite.GetEndpoint("blob")}/{LocalCluster.StorageAccount};"
            + $"QueueEndpoint={azurite.GetEndpoint("queue")}/{LocalCluster.StorageAccount};"
            + $"TableEndpoint={azurite.GetEndpoint("table")}/{LocalCluster.StorageAccount};");
        return new PhotoStorage(builder.AddConnectionString("blobs", connection), azurite);
    }
}
