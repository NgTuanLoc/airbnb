using Wolverine.Attributes;

namespace Airbnb.Modules.Bookings.Contracts;

// Published on the "bookings" fanout exchange when a guest cancels.
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
