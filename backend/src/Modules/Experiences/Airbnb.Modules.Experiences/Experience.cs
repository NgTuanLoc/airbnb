namespace Airbnb.Modules.Experiences;

internal sealed class Experience
{
    public required string Id { get; init; }

    public required string Title { get; init; }

    public required Location Location { get; init; }

    public required List<string> Photos { get; init; }

    public decimal PricePerPerson { get; init; }

    public decimal DurationHours { get; init; }

    public decimal Rating { get; init; }

    public int ReviewCount { get; init; }

    public bool IsNew { get; init; }

    public required string HostId { get; init; }

    public required string Category { get; init; }

    public required string Description { get; init; }

    // Position in the frontend mock array, so lists come back in the same order.
    public int SortOrder { get; init; }
}

internal sealed class Location
{
    public required string City { get; init; }

    public required string Country { get; init; }

    public double Lat { get; init; }

    public double Lng { get; init; }
}
