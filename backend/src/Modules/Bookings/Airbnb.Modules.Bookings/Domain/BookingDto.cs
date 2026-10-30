using System.Globalization;
using System.Text.Json.Serialization;

namespace Airbnb.Modules.Bookings;

internal sealed record PriceLineItemDto(string Label, decimal Amount);

internal sealed record PriceBreakdownDto(IReadOnlyList<PriceLineItemDto> LineItems, decimal Total);

internal sealed record GuestCountsDto(int Adults, int Children);

internal sealed record BookingDto(
    string Id,
    string ListingId,
    string HostId,
    string GuestId,
    string GuestName,
    string GuestEmail,
    DateOnly CheckIn,
    DateOnly CheckOut,
    GuestCountsDto Guests,
    PriceBreakdownDto PriceBreakdown,
    string Status,
    DateTimeOffset CreatedAt,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] DateTimeOffset? CancelledAt)
{
    internal static BookingDto From(Booking booking)
    {
        var nights = booking.Nights == 1 ? "night" : "nights";
        var nightly = booking.NightlyPrice.ToString("0.##", CultureInfo.InvariantCulture);
        var lineItems = new[]
        {
            new PriceLineItemDto($"${nightly} x {booking.Nights} {nights}", booking.NightlyPrice * booking.Nights),
            new PriceLineItemDto("Cleaning fee", booking.CleaningFee),
            new PriceLineItemDto("Airbnb service fee", booking.ServiceFee),
        };
        return new BookingDto(
            booking.Id, booking.ListingId, booking.HostId, booking.GuestId, booking.GuestName, booking.GuestEmail,
            booking.CheckIn, booking.CheckOut, new GuestCountsDto(booking.Adults, booking.Children),
            new PriceBreakdownDto(lineItems, booking.Total), booking.Status, booking.CreatedAt, booking.CancelledAt);
    }
}

internal sealed record StayDto(DateOnly CheckIn, DateOnly CheckOut);
