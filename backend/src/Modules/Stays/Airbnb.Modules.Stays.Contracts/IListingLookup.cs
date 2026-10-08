namespace Airbnb.Modules.Stays.Contracts;

// Lets other modules check that a listing exists without depending on the Stays module (spec §1).
public interface IListingLookup
{
    Task<bool> ExistsAsync(string listingId, CancellationToken cancellationToken);

    // Null when the listing does not exist.
    Task<ListingBookingInfo?> FindForBookingAsync(string listingId, CancellationToken cancellationToken);
}
