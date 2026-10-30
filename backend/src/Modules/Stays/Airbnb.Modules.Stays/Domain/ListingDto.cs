using System.Linq.Expressions;

namespace Airbnb.Modules.Stays.Listings;

// Wire shape of the frontend's Listing type.
internal sealed record ListingDto(
    string Id,
    string Title,
    LocationDto Location,
    IReadOnlyList<string> Photos,
    decimal PricePerNight,
    decimal Rating,
    int ReviewCount,
    bool IsGuestFavorite,
    string HostId,
    string Category,
    string Description,
    string PropertyType,
    int MaxGuests,
    int Bedrooms,
    int Beds,
    decimal Baths,
    IReadOnlyList<string> Amenities)
{
    public static readonly Expression<Func<Listing, ListingDto>> Projection = l => new ListingDto(
        l.Id,
        l.Title,
        new LocationDto(l.Location.City, l.Location.Country, l.Location.Lat, l.Location.Lng),
        l.Photos,
        l.PricePerNight,
        l.Rating,
        l.ReviewCount,
        l.IsGuestFavorite,
        l.HostId,
        l.Category,
        l.Description,
        l.PropertyType,
        l.MaxGuests,
        l.Bedrooms,
        l.Beds,
        l.Baths,
        l.Amenities);
}

internal sealed record LocationDto(string City, string Country, double Lat, double Lng);
