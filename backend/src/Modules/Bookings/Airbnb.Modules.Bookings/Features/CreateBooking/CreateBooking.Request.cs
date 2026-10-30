using System.ComponentModel.DataAnnotations;

namespace Airbnb.Modules.Bookings;

internal static partial class CreateBooking
{
    public sealed record QuoteInput(
        [property: Required, StringLength(50, MinimumLength = 1)] string? HostId,
        [property: Range(typeof(decimal), "1", "100000")] decimal PricePerNight,
        [property: Range(1, 16)] int MaxGuests,
        // Optional so quotes from before titles still book; the events then carry an empty title.
        [property: StringLength(200)] string? Title = null);

    // Passed through to the payment service once, never stored; it checks the card itself.
    public sealed record CardInput(
        [property: StringLength(30)] string? Number,
        int ExpMonth,
        int ExpYear,
        [property: StringLength(4)] string? Cvc);

    public sealed record Command(
        [property: Required, StringLength(50, MinimumLength = 1)] string? ListingId,
        [property: Required, StringLength(10)] string? CheckIn,
        [property: Required, StringLength(10)] string? CheckOut,
        [property: Range(1, 16)] int Adults,
        [property: Range(0, 15)] int Children,
        QuoteInput? Quote,
        CardInput? Card = null);
}
