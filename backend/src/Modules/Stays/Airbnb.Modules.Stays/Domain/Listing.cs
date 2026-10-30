namespace Airbnb.Modules.Stays.Listings;

internal sealed class Listing
{
    public required string Id { get; init; }

    public required string Title { get; init; }

    public required Location Location { get; init; }

    public required List<string> Photos { get; init; }

    public decimal PricePerNight { get; init; }

    public decimal Rating { get; init; }

    public int ReviewCount { get; init; }

    public bool IsGuestFavorite { get; init; }

    public required string HostId { get; init; }

    public required string Category { get; init; }

    public required string Description { get; init; }

    public required string PropertyType { get; init; }

    public int MaxGuests { get; init; }

    public int Bedrooms { get; init; }

    public int Beds { get; init; }

    public decimal Baths { get; init; }

    public required List<string> Amenities { get; init; }

    // Position in the frontend mock array, so lists come back in the same order (IDs like "l10" don't sort naturally).
    public int SortOrder { get; init; }
}

internal sealed class Location
{
    public required string City { get; init; }

    public required string Country { get; init; }

    public double Lat { get; init; }

    public double Lng { get; init; }
}
