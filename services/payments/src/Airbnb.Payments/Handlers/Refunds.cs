using Airbnb.Payments.Contracts;
using Airbnb.Payments.Data;
using Airbnb.Payments.Provider;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Payments.Handlers;

// Give back whatever the provider took for a booking: queued (durably) by a void.
public sealed record RefundPayment(string BookingId);

// Compensation, at the provider: a guest cancelled a confirmed booking (booking-cancelled), or the monolith voided the
// payment (RefundPayment). The provider refunds a succeeded charge and has nothing to give back otherwise. While the
// charge is still processing there, or the provider can't be reached, the call throws and Wolverine retries (1 s, 3 s,
// 10 s, then 1, 5 and 30 minutes). Repeats change nothing.
public static class RefundHandler
{
    public static Task Handle(BookingCancelled booking, ProviderClient provider, PaymentsDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        RefundAsync(booking.BookingId, provider, db, time, cancellationToken);

    public static Task Handle(RefundPayment refund, ProviderClient provider, PaymentsDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        RefundAsync(refund.BookingId, provider, db, time, cancellationToken);

    private static async Task RefundAsync(string bookingId, ProviderClient provider, PaymentsDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        await provider.RefundAsync(bookingId, cancellationToken);
        // A voided payment stays voided: that's what the booking side asked for.
        await db.Payments
            .Where(p => p.BookingId == bookingId && p.Status == PaymentStatus.Succeeded)
            .ExecuteUpdateAsync(set => set
                .SetProperty(p => p.Status, PaymentStatus.Refunded)
                .SetProperty(p => p.UpdatedAt, time.GetUtcNow()), cancellationToken);
    }
}
