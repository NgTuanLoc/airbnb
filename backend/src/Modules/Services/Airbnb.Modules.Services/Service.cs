namespace Airbnb.Modules.Services;

internal sealed class Service
{
    public required string Id { get; init; }

    public required string Title { get; init; }

    public required string Provider { get; init; }

    public required string ServiceCategory { get; init; }

    public required List<string> Photos { get; init; }

    public decimal Price { get; init; }

    public decimal Rating { get; init; }

    public int ReviewCount { get; init; }

    public required string City { get; init; }

    public required string Description { get; init; }

    // Position in the frontend mock array, so lists come back in the same order.
    public int SortOrder { get; init; }
}
