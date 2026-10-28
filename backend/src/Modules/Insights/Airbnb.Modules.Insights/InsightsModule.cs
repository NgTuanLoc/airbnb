using Airbnb.Modules.Insights.Data;
using Airbnb.SharedKernel.Persistence;
using Confluent.Kafka;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Insights;

// Listing views over Kafka (docs/superpowers/specs/2026-10-28-listing-views-kafka-design.md): views go to the
// listing-views topic, and a projection keeps daily counts per listing in the insights schema.
public static class InsightsModule
{
    internal const string Schema = "insights";
    internal const string CacheTag = "insights";

    // The Aspire resource (and connection string) of the Kafka broker.
    private const string KafkaConnectionName = "kafka";
    private const string ProjectionEnabledKey = "Insights:Projection:Enabled";

    public static IHostApplicationBuilder AddInsightsModule(this IHostApplicationBuilder builder)
    {
        builder.AddInsightsModuleDatabase();
        builder.Services.AddScoped<GetListingViews.Handler>();
        builder.Services.AddSingleton<ProjectionControl>();

        builder.AddKafkaProducer<string, string>(KafkaConnectionName, settings =>
        {
            // Idempotent, so the producer's own retries never put a view in the log twice.
            settings.Config.EnableIdempotence = true;
            // No traceparent header: records are kept forever, and a trace id would tie each view to the guest's request.
            settings.DisableTracing = true;
        });
        // Registered before the projection, which subscribes to the topic it creates.
        builder.Services.AddHostedService<ListingViewsTopic>();

        if (builder.Configuration.GetValue(ProjectionEnabledKey, true))
        {
            builder.AddKafkaConsumer<string, string>(
                KafkaConnectionName,
                settings =>
                {
                    settings.Config.GroupId = ListingViewsProjection.GroupId;
                    // Offsets live in Postgres with the counts; the projection commits Kafka's itself, for display.
                    settings.Config.EnableAutoCommit = false;
                    settings.Config.AutoOffsetReset = AutoOffsetReset.Earliest;
                },
                (services, consumer) => consumer
                    .SetPartitionsAssignedHandler((_, partitions) => services.GetRequiredService<ListingViewsProjection>().OnAssigned(partitions))
                    .SetPartitionsRevokedHandler((_, _) => services.GetRequiredService<ListingViewsProjection>().OnRevoked())
                    .SetPartitionsLostHandler((_, _) => services.GetRequiredService<ListingViewsProjection>().OnLost()));
            builder.Services.AddSingleton<ListingViewsProjection>();
            builder.Services.AddHostedService(services => services.GetRequiredService<ListingViewsProjection>());
        }
        return builder;
    }

    public static IHostApplicationBuilder AddInsightsModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<InsightsDbContext>(Schema, InsightsDbContext.SeedAsync);

    public static IEndpointRouteBuilder MapInsightsEndpoints(this IEndpointRouteBuilder api)
    {
        RecordListingView.Map(api);
        GetListingViews.Map(api);
        RebuildListingViews.Map(api);
        return api;
    }
}
