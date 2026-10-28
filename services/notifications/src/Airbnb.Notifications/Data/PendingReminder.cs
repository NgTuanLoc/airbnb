namespace Airbnb.Notifications.Data;

// A review reminder waiting for its time: written when a booking is confirmed (or, cancelled first, already marked
// cancelled), so the reminder knows what to say and whether to say it.
internal sealed class PendingReminder
{
    public required string BookingId { get; init; }
    public required string ListingId { get; init; }
    public required string ListingTitle { get; init; }
    public required string GuestName { get; init; }
    public required string GuestEmail { get; init; }
    public required DateOnly CheckOut { get; init; }
    public required DateTimeOffset DueAt { get; init; }
    public bool Cancelled { get; set; }
}
