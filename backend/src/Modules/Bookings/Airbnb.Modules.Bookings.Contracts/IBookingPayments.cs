namespace Airbnb.Modules.Bookings.Contracts;

// The payment service's word on a booking's payment (its payment-succeeded / payment-declined events): a pending
// booking is confirmed or declined; one settled already stays as it is.
public interface IBookingPayments
{
    Task SettleAsync(string bookingId, bool paid, CancellationToken cancellationToken);
}
