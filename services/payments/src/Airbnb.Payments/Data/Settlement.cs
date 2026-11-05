using Airbnb.Payments.Contracts;
using Airbnb.Payments.Handlers;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Airbnb.Payments.Data;

// A payment leaves processing once, in one transaction with its announcement (the outbox), whichever path gets there
// first: the charge's own answer, the provider's webhook or a refresh. The others find it settled and change nothing,
// except a success that comes after this side gave up, which is refunded.
public static class Settlement
{
    // Status is succeeded or declined. Joins the caller's transaction if one is open, and commits it either way.
    // True when this call moved the payment.
    public static async Task<bool> TrySettleAsync(this IDbContextOutbox<PaymentsDbContext> outbox, string bookingId, string status,
        string? declineReason, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (outbox.DbContext.Database.CurrentTransaction is null)
        {
            await outbox.DbContext.Database.BeginTransactionAsync(cancellationToken);
        }
        var moved = await outbox.DbContext.Payments
            .Where(p => p.BookingId == bookingId && p.Status == PaymentStatus.Processing)
            .ExecuteUpdateAsync(set => set
                .SetProperty(p => p.Status, status)
                .SetProperty(p => p.DeclineReason, declineReason)
                .SetProperty(p => p.UpdatedAt, now), cancellationToken) == 1;
        if (moved && status == PaymentStatus.Succeeded)
        {
            await outbox.PublishAsync(new PaymentSucceeded(bookingId));
        }
        else if (moved)
        {
            await outbox.PublishAsync(new PaymentDeclined(bookingId, declineReason));
        }
        else if (status == PaymentStatus.Succeeded && await IsGivenUpAsync(outbox.DbContext, bookingId, cancellationToken))
        {
            // The money was taken after this side gave up on the charge: give it back. The void's own refund may have
            // come too early to find it (the charge was still on its way to the provider).
            await outbox.PublishAsync(new RefundPayment(bookingId));
        }
        await outbox.SaveChangesAndFlushMessagesAsync(cancellationToken);
        return moved;
    }

    // Voided (the booking side gave up), or no payment at all (its claim was released after a refusal).
    private static async Task<bool> IsGivenUpAsync(PaymentsDbContext db, string bookingId, CancellationToken cancellationToken) =>
        await db.Payments.Where(p => p.BookingId == bookingId).Select(p => p.Status).SingleOrDefaultAsync(cancellationToken)
            is null or PaymentStatus.Voided;
}
