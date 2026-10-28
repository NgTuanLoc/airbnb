using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Airbnb.Payments.Data;

public static class PaymentStatus
{
    // Claimed before the processor is called, so a concurrent request for the same booking can't charge again.
    public const string Processing = "processing";
    public const string Succeeded = "succeeded";
    public const string Declined = "declined";
    public const string Voided = "voided";
    public const string Refunded = "refunded";
}

// One payment per booking: the booking id is the idempotency key. Brand and last 4 digits only, never the card.
public sealed class Payment
{
    public required string BookingId { get; init; }
    public required decimal Amount { get; init; }
    public required string Currency { get; init; }
    public required string Status { get; set; }
    public required string Brand { get; init; }
    public required string Last4 { get; init; }
    public string? DeclineReason { get; set; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required DateTimeOffset UpdatedAt { get; set; }
}

public sealed class PaymentsDbContext(DbContextOptions<PaymentsDbContext> options) : DbContext(options)
{
    public DbSet<Payment> Payments => Set<Payment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) =>
        modelBuilder.Entity<Payment>(payment =>
        {
            payment.ToTable("payments");
            payment.HasKey(p => p.BookingId);
            payment.Property(p => p.BookingId).HasMaxLength(40);
            payment.Property(p => p.Amount).HasPrecision(12, 2);
            payment.Property(p => p.Currency).HasMaxLength(3);
            payment.Property(p => p.Status).HasMaxLength(20);
            payment.Property(p => p.Brand).HasMaxLength(20);
            payment.Property(p => p.Last4).HasMaxLength(4);
            payment.Property(p => p.DeclineReason).HasMaxLength(40);
        });

    // Claims the booking's payment as processing. False when a payment for it already exists (or is being made): the
    // insert waits on a concurrent claim's row lock, then sees the conflict.
    public async Task<bool> TryClaimAsync(Payment payment, CancellationToken cancellationToken) =>
        await Database.ExecuteSqlAsync($"""
            INSERT INTO payments ("BookingId", "Amount", "Currency", "Status", "Brand", "Last4", "CreatedAt", "UpdatedAt")
            VALUES ({payment.BookingId}, {payment.Amount}, {payment.Currency}, {payment.Status}, {payment.Brand}, {payment.Last4}, {payment.CreatedAt}, {payment.UpdatedAt})
            ON CONFLICT DO NOTHING
            """, cancellationToken) == 1;
}

public static class PaymentVoids
{
    // Voids the booking's payment in one statement: succeeded or still processing becomes voided, and with no payment
    // yet a voided row is left behind, so a charge that arrives later (a retry still in flight) can't land.
    public static Task VoidAsync(this PaymentsDbContext db, string bookingId, DateTimeOffset now, CancellationToken cancellationToken) =>
        db.Database.ExecuteSqlAsync($"""
            INSERT INTO payments ("BookingId", "Amount", "Currency", "Status", "Brand", "Last4", "CreatedAt", "UpdatedAt")
            VALUES ({bookingId}, 0, 'USD', {PaymentStatus.Voided}, '', '', {now}, {now})
            ON CONFLICT ("BookingId") DO UPDATE SET "Status" = excluded."Status", "UpdatedAt" = excluded."UpdatedAt"
            WHERE payments."Status" IN ({PaymentStatus.Processing}, {PaymentStatus.Succeeded})
            """, cancellationToken);
}

public sealed class PaymentsDbContextFactory : IDesignTimeDbContextFactory<PaymentsDbContext>
{
    public PaymentsDbContext CreateDbContext(string[] args) =>
        new(new DbContextOptionsBuilder<PaymentsDbContext>().UseNpgsql("Host=localhost;Database=design-time").Options);
}
