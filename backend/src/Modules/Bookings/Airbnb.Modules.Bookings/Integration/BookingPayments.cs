using Airbnb.Modules.Bookings.Contracts;
using Airbnb.Modules.Bookings.Data;
using Airbnb.Modules.Bookings.Payments;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings;

// The event, the booking request and the reconciler may each try to settle a booking; Status is the concurrency token,
// so one of them moves it and only that one sends booking-confirmed.
internal sealed class BookingPayments(IDbContextOutbox<BookingsDbContext> outbox, TimeProvider time) : IBookingPayments
{
    public async Task SettleAsync(string bookingId, bool paid, CancellationToken cancellationToken)
    {
        var booking = await outbox.DbContext.Bookings.SingleOrDefaultAsync(b => b.Id == bookingId && b.Status == BookingStatus.Pending, cancellationToken);
        if (booking is null)
        {
            return;
        }
        if (paid)
        {
            await PaymentOutcomes.ConfirmAsync(outbox, booking, time, cancellationToken);
        }
        else
        {
            await PaymentOutcomes.DeclineAsync(outbox, booking, cancellationToken);
        }
    }
}
