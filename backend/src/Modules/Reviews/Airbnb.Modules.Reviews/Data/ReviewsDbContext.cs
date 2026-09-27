using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Reviews.Data;

internal sealed class ReviewsDbContext(DbContextOptions<ReviewsDbContext> options) : DbContext(options)
{
    public DbSet<Review> Reviews => Set<Review>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(ReviewsModule.Schema);

        modelBuilder.Entity<Review>(review =>
        {
            review.ToTable("reviews");
            review.Property(r => r.Id).HasMaxLength(50);
            review.Property(r => r.SubjectType).HasMaxLength(20);
            review.Property(r => r.SubjectId).HasMaxLength(50);
            // Serves "reviews of one subject, newest first".
            review.HasIndex(r => new { r.SubjectId, r.CreatedAt }).IsDescending(false, true);
        });
    }

    // Runs inside MigrateAsync; inserts only into an empty table, so restarts never duplicate data.
    internal static async Task SeedAsync(ReviewsDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Reviews.AnyAsync(cancellationToken))
        {
            db.Reviews.AddRange(SeedData.Load<Review>(typeof(ReviewsDbContext).Assembly, "reviews.json"));
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}

// Lets `dotnet ef migrations add` build the context without a running host.
internal sealed class ReviewsDbContextFactory : IDesignTimeDbContextFactory<ReviewsDbContext>
{
    public ReviewsDbContext CreateDbContext(string[] args) =>
        new(ModuleDatabase.DesignTimeOptions<ReviewsDbContext>(ReviewsModule.Schema));
}
