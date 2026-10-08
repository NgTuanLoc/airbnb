namespace Airbnb.Modules.Stays.Contracts;

// What booking a listing needs to know: who hosts it, its nightly price and how many guests it takes.
public sealed record ListingBookingInfo(string HostId, decimal PricePerNight, int MaxGuests);
