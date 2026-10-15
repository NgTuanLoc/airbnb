using Airbnb.Modules.Identity.External;
using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Identity.Data;

internal sealed class IdentityDbContext(DbContextOptions<IdentityDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<ExternalLogin> ExternalLogins => Set<ExternalLogin>();
    public DbSet<ExternalLoginFlow> ExternalLoginFlows => Set<ExternalLoginFlow>();

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

        modelBuilder.Entity<ExternalLogin>(login =>
        {
            login.ToTable("external_logins");
            // A provider account belongs to at most one user, even when two first sign-ins race (OAuth spec §1).
            login.HasKey(l => new { l.Provider, l.Subject });
            login.Property(l => l.Provider).HasMaxLength(64);
            login.Property(l => l.Subject).HasMaxLength(255);
            login.Property(l => l.UserId).HasMaxLength(40);
            login.Property(l => l.Email).HasMaxLength(254);
            login.HasOne(l => l.User).WithMany().HasForeignKey(l => l.UserId).OnDelete(DeleteBehavior.Cascade);
            // One account per provider per user, so "disconnect Google" names exactly one row.
            login.HasIndex(l => new { l.UserId, l.Provider }).IsUnique();
        });

        modelBuilder.Entity<ExternalLoginFlow>(flow =>
        {
            flow.ToTable("external_login_flows");
            flow.HasKey(f => f.IdHash);
            flow.Property(f => f.IdHash).HasMaxLength(64);
            flow.Property(f => f.Provider).HasMaxLength(64);
            flow.Property(f => f.State).HasMaxLength(64);
            flow.Property(f => f.Nonce).HasMaxLength(64);
            flow.Property(f => f.CodeVerifier).HasMaxLength(128);
            flow.Property(f => f.LinkUserId).HasMaxLength(40);
            flow.HasOne<User>().WithMany().HasForeignKey(f => f.LinkUserId).OnDelete(DeleteBehavior.Cascade);
            // Every start purges expired flows by this index.
            flow.HasIndex(f => f.ExpiresAt);
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
