using Airbnb.Modules.Insights.Data;
using Airbnb.SharedKernel.Persistence;
using Microsoft.Extensions.Hosting;

namespace Airbnb.Modules.Insights;

// Listing views over Kafka (docs/superpowers/specs/2026-10-28-listing-views-kafka-design.md): views go to the
// listing-views topic, and a projection keeps daily counts per listing in the insights schema.
public static class InsightsModule
{
    internal const string Schema = "insights";
    internal const string CacheTag = "insights";

    public static IHostApplicationBuilder AddInsightsModuleDatabase(this IHostApplicationBuilder builder) =>
        builder.AddModuleDbContext<InsightsDbContext>(Schema, InsightsDbContext.SeedAsync);
}
