using Airbnb.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Modules.Bookings.Data;

internal sealed class BookingsDbContext(DbContextOptions<BookingsDbContext> options) : DbContext(options)
{
    // The name of the exclusion constraint that refuses overlapping confirmed stays (spec §1).
    internal const string NoOverlapConstraint = "bookings_no_overlap";

    public DbSet<Booking> Bookings => Set<Booking>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(BookingsModule.Schema);
        modelBuilder.Entity<Booking>(booking =>
        {
            booking.ToTable("bookings");
            booking.Property(b => b.Id).HasMaxLength(40);
            booking.Property(b => b.ListingId).HasMaxLength(50);
            booking.Property(b => b.HostId).HasMaxLength(50);
            booking.Property(b => b.GuestId).HasMaxLength(40);
            booking.Property(b => b.GuestName).HasMaxLength(60);
            booking.Property(b => b.GuestEmail).HasMaxLength(254);
            booking.Property(b => b.Status).HasMaxLength(20);
            booking.Property(b => b.NightlyPrice).HasPrecision(10, 2);
            booking.Property(b => b.CleaningFee).HasPrecision(10, 2);
            booking.Property(b => b.ServiceFee).HasPrecision(10, 2);
            booking.Property(b => b.Total).HasPrecision(12, 2);
            booking.HasIndex(b => b.GuestId);
            booking.HasIndex(b => b.HostId);
            booking.HasIndex(b => new { b.ListingId, b.CheckIn });
        });
    }

    internal static Task SeedAsync(BookingsDbContext db, CancellationToken cancellationToken) => Task.CompletedTask;
}

internal sealed class BookingsDbContextFactory : IDesignTimeDbContextFactory<BookingsDbContext>
{
    public BookingsDbContext CreateDbContext(string[] args) =>
        new(ModuleDatabase.DesignTimeOptions<BookingsDbContext>(BookingsModule.Schema));
}
