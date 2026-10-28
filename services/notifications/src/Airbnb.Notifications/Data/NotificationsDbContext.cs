using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Notifications.Data;

// One row per email this service has sent (or is sending, inside an open transaction): the claim that makes every email
// go out at most once, however often the broker delivers its event.
public sealed class SentEmail
{
    public required string BookingId { get; init; }
    public required string Kind { get; init; }
    public required DateTimeOffset SentAt { get; init; }
}

public static class EmailKinds
{
    public const string Confirmed = "confirmed";
    public const string Cancelled = "cancelled";
    public const string ReviewReminder = "review-reminder";
}

// This service's own database ("notifications"): nothing in it belongs to the monolith.
public sealed class NotificationsDbContext(DbContextOptions<NotificationsDbContext> options) : DbContext(options)
{
    public DbSet<SentEmail> SentEmails => Set<SentEmail>();

    public DbSet<PendingReminder> PendingReminders => Set<PendingReminder>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SentEmail>(sent =>
        {
            sent.ToTable("sent_emails");
            sent.HasKey(e => new { e.BookingId, e.Kind });
            sent.Property(e => e.BookingId).HasMaxLength(40);
            sent.Property(e => e.Kind).HasMaxLength(20);
        });
        modelBuilder.Entity<PendingReminder>(reminder =>
        {
            reminder.ToTable("pending_reminders");
            reminder.HasKey(r => r.BookingId);
            reminder.Property(r => r.BookingId).HasMaxLength(40);
            reminder.Property(r => r.ListingId).HasMaxLength(50);
            reminder.Property(r => r.ListingTitle).HasMaxLength(200);
            reminder.Property(r => r.GuestName).HasMaxLength(60);
            reminder.Property(r => r.GuestEmail).HasMaxLength(254);
        });
    }

    // Claims an email inside the caller's transaction. False when another delivery already sent it or is sending it: a
    // concurrent claim waits on that row's lock, then sees the conflict once the first commits (or wins if it rolls back).
    // ON CONFLICT instead of catching a unique violation, which would abort the transaction.
    public async Task<bool> TryClaimAsync(string bookingId, string kind, DateTimeOffset now, CancellationToken cancellationToken) =>
        await Database.ExecuteSqlAsync($"""
            INSERT INTO sent_emails ("BookingId", "Kind", "SentAt") VALUES ({bookingId}, {kind}, {now})
            ON CONFLICT DO NOTHING
            """, cancellationToken) == 1;
}

public sealed class NotificationsDbContextFactory : IDesignTimeDbContextFactory<NotificationsDbContext>
{
    public NotificationsDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<NotificationsDbContext>().UseNpgsql("Host=localhost;Database=design-time").Options);
}
