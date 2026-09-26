using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Services.Data;

internal sealed class ServicesDbContext(DbContextOptions<ServicesDbContext> options) : DbContext(options)
{
    public DbSet<Service> Services => Set<Service>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(ServicesModule.Schema);

        modelBuilder.Entity<Service>(service =>
        {
            service.ToTable("services");
            service.Property(s => s.Id).HasMaxLength(50);
            service.Property(s => s.Price).HasPrecision(10, 2);
            service.Property(s => s.Rating).HasPrecision(3, 2);
        });
    }

    // Runs inside MigrateAsync; inserts only into an empty table, so restarts never duplicate data.
    internal static async Task SeedAsync(ServicesDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Services.AnyAsync(cancellationToken))
        {
            db.Services.AddRange(SeedData.Load<Service>(typeof(ServicesDbContext).Assembly, "services.json"));
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}

// Lets `dotnet ef migrations add` build the context without a running host.
internal sealed class ServicesDbContextFactory : IDesignTimeDbContextFactory<ServicesDbContext>
{
    public ServicesDbContext CreateDbContext(string[] args) =>
        new(ModuleDatabase.DesignTimeOptions<ServicesDbContext>(ServicesModule.Schema));
}
