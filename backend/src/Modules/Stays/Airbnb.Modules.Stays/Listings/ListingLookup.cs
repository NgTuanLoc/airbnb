using Airbnb.Modules.Stays.Contracts;
using Airbnb.Modules.Stays.Data;
using Microsoft.EntityFrameworkCore;

namespace Airbnb.Modules.Stays.Listings;

internal sealed class ListingLookup(StaysDbContext db) : IListingLookup
{
    public Task<bool> ExistsAsync(string listingId, CancellationToken cancellationToken) =>
        db.Listings.AnyAsync(l => l.Id == listingId, cancellationToken);
}
