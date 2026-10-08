namespace Airbnb.Modules.Bookings;

internal sealed class Booking
{
    public required string Id { get; init; }
    public required string ListingId { get; init; }
    public required string HostId { get; init; }
    public required string GuestId { get; init; }
    // Snapshots: the Identity module's tables are not ours to read (spec §1).
    public required string GuestName { get; init; }
    public required string GuestEmail { get; init; }
    public required DateOnly CheckIn { get; init; }
    public required DateOnly CheckOut { get; init; }
    public required int Adults { get; init; }
    public required int Children { get; init; }
    public required decimal NightlyPrice { get; init; }
    public required int Nights { get; init; }
    public required decimal CleaningFee { get; init; }
    public required decimal ServiceFee { get; init; }
    public required decimal Total { get; init; }
    public required string Status { get; set; }
    public required DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset? CancelledAt { get; set; }
}
