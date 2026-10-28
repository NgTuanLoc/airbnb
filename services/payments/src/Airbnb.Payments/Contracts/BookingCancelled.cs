using Wolverine.Attributes;

namespace Airbnb.Payments.Contracts;

// This service's own copy of the monolith's event (only BookingId is read: the payment to refund).
[MessageIdentity("booking-cancelled")]
public sealed record BookingCancelled(
    string BookingId,
    string ListingId,
    string ListingTitle,
    string GuestName,
    string GuestEmail,
    DateOnly CheckIn,
    DateOnly CheckOut,
    DateTimeOffset CancelledAt);
