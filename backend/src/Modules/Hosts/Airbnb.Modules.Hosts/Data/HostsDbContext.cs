using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Hosts.Data;

internal sealed class HostsDbContext(DbContextOptions<HostsDbContext> options) : DbContext(options)
{
    public DbSet<HostProfile> Hosts => Set<HostProfile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(HostsModule.Schema);

        modelBuilder.Entity<HostProfile>(host =>
        {
            host.ToTable("hosts");
            host.Property(h => h.Id).HasMaxLength(50);
        });
    }

    // Runs inside MigrateAsync; inserts only into an empty table, so restarts never duplicate data.
    internal static async Task SeedAsync(HostsDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Hosts.AnyAsync(cancellationToken))
        {
            db.Hosts.AddRange(SeedData.Load<HostProfile>(typeof(HostsDbContext).Assembly, "hosts.json"));
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}

// Lets `dotnet ef migrations add` build the context without a running host.
internal sealed class HostsDbContextFactory : IDesignTimeDbContextFactory<HostsDbContext>
{
    public HostsDbContext CreateDbContext(string[] args) => new(ModuleDatabase.DesignTimeOptions<HostsDbContext>(HostsModule.Schema));
}
