using Airbnb.Modules.Bookings.Contracts;
using Wolverine.Attributes;

namespace Airbnb.Api.Messaging;

// The payment service's events on its "payments" fanout exchange (its own records; these are the monolith's copies,
// matched by identity and camelCase JSON): a payment left processing settles the booking waiting on it.
[MessageIdentity("payment-succeeded")]
public sealed record PaymentSucceeded(string BookingId);

[MessageIdentity("payment-declined")]
public sealed record PaymentDeclined(string BookingId, string? DeclineReason);

public static class PaymentSucceededHandler
{
    public static Task HandleAsync(PaymentSucceeded message, IBookingPayments bookings, CancellationToken cancellationToken) =>
        bookings.SettleAsync(message.BookingId, paid: true, cancellationToken);
}

public static class PaymentDeclinedHandler
{
    public static Task HandleAsync(PaymentDeclined message, IBookingPayments bookings, CancellationToken cancellationToken) =>
        bookings.SettleAsync(message.BookingId, paid: false, cancellationToken);
}
