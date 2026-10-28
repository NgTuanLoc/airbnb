namespace Airbnb.Modules.Stays.Contracts;

// What booking a listing needs to know: who hosts it, its nightly price, how many guests it takes, and its title (for
// the booking events' emails).
public sealed record ListingBookingInfo(string HostId, decimal PricePerNight, int MaxGuests, string Title);
