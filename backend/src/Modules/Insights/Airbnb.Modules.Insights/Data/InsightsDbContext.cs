using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Insights.Data;

// Views per listing per UTC day: a projection of the listing-views topic, rebuilt from it on demand.
internal sealed class ListingDailyViews
{
    public required string ListingId { get; init; }
    public DateOnly Day { get; init; }
    public long Views { get; set; }
}

// Where the projection resumes each partition. Written in the same transaction as the counts, which is what makes the
// projection exactly once: Kafka's own committed offsets are only for showing the lag in Kafka UI.
internal sealed class ConsumerOffset
{
    public required string Topic { get; init; }
    public int Partition { get; init; }
    public long NextOffset { get; set; }
}

internal sealed class InsightsDbContext(DbContextOptions<InsightsDbContext> options) : DbContext(options)
{
    internal const string DailyViewsTable = "listing_daily_views";
    internal const string ConsumerOffsetsTable = "consumer_offsets";

    public DbSet<ListingDailyViews> DailyViews => Set<ListingDailyViews>();

    public DbSet<ConsumerOffset> ConsumerOffsets => Set<ConsumerOffset>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(InsightsModule.Schema);
        modelBuilder.Entity<ListingDailyViews>(views =>
        {
            views.ToTable(DailyViewsTable);
            views.HasKey(v => new { v.ListingId, v.Day });
            views.Property(v => v.ListingId).HasMaxLength(50);
        });
        modelBuilder.Entity<ConsumerOffset>(offset =>
        {
            offset.ToTable(ConsumerOffsetsTable);
            offset.HasKey(o => new { o.Topic, o.Partition });
            offset.Property(o => o.Topic).HasMaxLength(100);
        });
    }

    internal static Task SeedAsync(InsightsDbContext db, CancellationToken cancellationToken) => Task.CompletedTask;
}

internal sealed class InsightsDbContextFactory : IDesignTimeDbContextFactory<InsightsDbContext>
{
    public InsightsDbContext CreateDbContext(string[] args) =>
        new(ModuleDatabase.DesignTimeOptions<InsightsDbContext>(InsightsModule.Schema));
}
