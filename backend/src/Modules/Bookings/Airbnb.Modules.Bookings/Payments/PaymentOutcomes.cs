using Airbnb.Modules.Bookings.Contracts;
using Airbnb.Modules.Bookings.Data;
using Microsoft.EntityFrameworkCore;
using Wolverine.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings.Payments;

// Settling a pending booking, from the booking request or the reconciler, whichever gets there first. Status is a
// concurrency token, so only one of them moves it (and only the winner's booking-confirmed is sent); the loser gets
// false and the booking as it now is.
internal static class PaymentOutcomes
{
    public static async Task<bool> ConfirmAsync(IDbContextOutbox<BookingsDbContext> outbox, Booking booking, TimeProvider time, CancellationToken cancellationToken)
    {
        booking.Status = BookingStatus.Confirmed;
        await outbox.PublishAsync(new BookingConfirmed(
            booking.Id, booking.ListingId, booking.ListingTitle, booking.GuestName, booking.GuestEmail,
            booking.CheckIn, booking.CheckOut, booking.Adults, booking.Children, booking.Total, time.GetUtcNow()));
        return await SaveAsync(outbox, booking, cancellationToken);
    }

    public static Task<bool> DeclineAsync(IDbContextOutbox<BookingsDbContext> outbox, Booking booking, CancellationToken cancellationToken)
    {
        booking.Status = BookingStatus.Declined;
        return SaveAsync(outbox, booking, cancellationToken);
    }

    private static async Task<bool> SaveAsync(IDbContextOutbox<BookingsDbContext> outbox, Booking booking, CancellationToken cancellationToken)
    {
        try
        {
            await outbox.SaveChangesAndFlushMessagesAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateConcurrencyException)
        {
            await outbox.DbContext.Entry(booking).ReloadAsync(cancellationToken);
            return false;
        }
    }
}
