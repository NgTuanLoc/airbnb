using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Experiences.Data;

internal sealed class ExperiencesDbContext(DbContextOptions<ExperiencesDbContext> options) : DbContext(options)
{
    public DbSet<Experience> Experiences => Set<Experience>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(ExperiencesModule.Schema);

        modelBuilder.Entity<Experience>(experience =>
        {
            experience.ToTable("experiences");
            experience.Property(e => e.Id).HasMaxLength(50);
            experience.ComplexProperty(e => e.Location);
            experience.Property(e => e.PricePerPerson).HasPrecision(10, 2);
            experience.Property(e => e.DurationHours).HasPrecision(4, 1);
            experience.Property(e => e.Rating).HasPrecision(3, 2);
        });
    }

    // Runs inside MigrateAsync; inserts only into an empty table, so restarts never duplicate data.
    internal static async Task SeedAsync(ExperiencesDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Experiences.AnyAsync(cancellationToken))
        {
            db.Experiences.AddRange(SeedData.Load<Experience>(typeof(ExperiencesDbContext).Assembly, "experiences.json"));
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}

// Lets `dotnet ef migrations add` build the context without a running host.
internal sealed class ExperiencesDbContextFactory : IDesignTimeDbContextFactory<ExperiencesDbContext>
{
    public ExperiencesDbContext CreateDbContext(string[] args) =>
        new(ModuleDatabase.DesignTimeOptions<ExperiencesDbContext>(ExperiencesModule.Schema));
}
