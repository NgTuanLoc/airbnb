using Airbnb.Modules.Stays.Contracts;
using Airbnb.Modules.Stays.Data;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Stays.Listings;

internal sealed class ListingLookup(StaysDbContext db) : IListingLookup
{
    public Task<bool> ExistsAsync(string listingId, CancellationToken cancellationToken) =>
        db.Listings.AnyAsync(l => l.Id == listingId, cancellationToken);

    public Task<ListingBookingInfo?> FindForBookingAsync(string listingId, CancellationToken cancellationToken) =>
        db.Listings
            .Where(l => l.Id == listingId)
            .Select(l => new ListingBookingInfo(l.HostId, l.PricePerNight, l.MaxGuests))
            .SingleOrDefaultAsync(cancellationToken);
}
