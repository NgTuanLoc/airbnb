using Airbnb.Modules.Stays.Cities;
using Airbnb.Modules.Stays.Listings;
using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Stays.Data;

internal sealed class StaysDbContext(DbContextOptions<StaysDbContext> options) : DbContext(options)
{
    internal const string ListingsTable = "listings";

    public DbSet<Listing> Listings => Set<Listing>();

    public DbSet<City> Cities => Set<City>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(StaysModule.Schema);
        modelBuilder.MapAppliedReviews();

        modelBuilder.Entity<Listing>(listing =>
        {
            listing.ToTable(ListingsTable);
            listing.Property(l => l.Id).HasMaxLength(50);
            listing.ComplexProperty(l => l.Location);
            listing.Property(l => l.PricePerNight).HasPrecision(10, 2);
            listing.Property(l => l.Rating).HasPrecision(3, 2);
            listing.Property(l => l.Baths).HasPrecision(4, 1);
        });

        modelBuilder.Entity<City>(city =>
        {
            city.ToTable("cities");
            city.Property(c => c.Id).HasMaxLength(50);
        });
    }

    // Runs inside MigrateAsync; inserts only into empty tables, so restarts never duplicate data.
    internal static async Task SeedAsync(StaysDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Listings.AnyAsync(cancellationToken))
        {
            db.Listings.AddRange(SeedData.Load<Listing>(typeof(StaysDbContext).Assembly, "listings.json"));
        }

        if (!await db.Cities.AnyAsync(cancellationToken))
        {
            db.Cities.AddRange(SeedData.Load<City>(typeof(StaysDbContext).Assembly, "cities.json"));
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}

// Lets `dotnet ef migrations add` build the context without a running host.
internal sealed class StaysDbContextFactory : IDesignTimeDbContextFactory<StaysDbContext>
{
    public StaysDbContext CreateDbContext(string[] args) => new(ModuleDatabase.DesignTimeOptions<StaysDbContext>(StaysModule.Schema));
}
