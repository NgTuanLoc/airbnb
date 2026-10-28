using Wolverine.Attributes;

namespace Airbnb.Modules.Bookings.Contracts;

// Published on the "bookings" fanout exchange when a booking is saved (notification service spec). It carries everything
// a listener needs, so nobody has to call back into the monolith. ListingTitle is empty when a host-listing quote had none.
[MessageIdentity("booking-confirmed")]
public sealed record BookingConfirmed(
    string BookingId,
    string ListingId,
    string ListingTitle,
    string GuestName,
    string GuestEmail,
    DateOnly CheckIn,
    DateOnly CheckOut,
    int Adults,
    int Children,
    decimal Total,
    DateTimeOffset ConfirmedAt);
