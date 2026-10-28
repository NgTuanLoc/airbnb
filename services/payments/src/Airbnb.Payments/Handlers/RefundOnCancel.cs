using Airbnb.Payments.Contracts;
using Airbnb.Payments.Data;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Payments.Handlers;

// Compensation by event: a guest cancelled a confirmed booking, so its payment is refunded. One atomic update from
// succeeded, so a redelivered event changes nothing.
public static class RefundOnCancelHandler
{
    public static Task Handle(BookingCancelled booking, PaymentsDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        db.Payments
            .Where(p => p.BookingId == booking.BookingId && p.Status == PaymentStatus.Succeeded)
            .ExecuteUpdateAsync(set => set
                .SetProperty(p => p.Status, PaymentStatus.Refunded)
                .SetProperty(p => p.UpdatedAt, time.GetUtcNow()), cancellationToken);
}
