using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Identity.Data;

internal sealed class IdentityDbContext(DbContextOptions<IdentityDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Session> Sessions => Set<Session>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(IdentityModule.Schema);

        modelBuilder.Entity<User>(user =>
        {
            user.ToTable("users");
            user.Property(u => u.Id).HasMaxLength(40);
            user.Property(u => u.Email).HasMaxLength(254);
            user.Property(u => u.Name).HasMaxLength(60);
            // The one guard against duplicate accounts, even when two registrations race (spec §1).
            user.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<Session>(session =>
        {
            session.ToTable("sessions");
            session.HasKey(s => s.TokenHash);
            session.Property(s => s.TokenHash).HasMaxLength(64);
            session.Property(s => s.UserId).HasMaxLength(40);
            session.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
            session.HasIndex(s => s.UserId);
        });
    }

    // No seed data: accounts are created by people registering.
    internal static Task SeedAsync(IdentityDbContext db, CancellationToken cancellationToken) => Task.CompletedTask;
}

// Lets `dotnet ef migrations add` build the context without a running host.
internal sealed class IdentityDbContextFactory : IDesignTimeDbContextFactory<IdentityDbContext>
{
    public IdentityDbContext CreateDbContext(string[] args) =>
        new(ModuleDatabase.DesignTimeOptions<IdentityDbContext>(IdentityModule.Schema));
}
