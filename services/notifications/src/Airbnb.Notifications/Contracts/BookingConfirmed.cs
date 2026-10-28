using Wolverine.Attributes;

namespace Airbnb.Notifications.Contracts;

// This service's own copy of the monolith's event: matched on the wire by its identity and its camelCase JSON, never by
// a shared assembly. Only the fields this service reads need to stay in step.
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
