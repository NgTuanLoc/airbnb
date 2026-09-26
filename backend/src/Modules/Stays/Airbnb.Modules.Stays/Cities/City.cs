namespace Airbnb.Modules.Stays.Cities;

internal sealed class City
{
    public required string Id { get; init; }

    public required string Name { get; init; }

    public required string SubLabel { get; init; }

    public required string Image { get; init; }

    public int ListingCount { get; init; }

    public int SortOrder { get; init; }
}
