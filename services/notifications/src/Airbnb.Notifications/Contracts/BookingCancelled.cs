using Wolverine.Attributes;

namespace Airbnb.Notifications.Contracts;

// This service's own copy of the monolith's event (see BookingConfirmed).
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
