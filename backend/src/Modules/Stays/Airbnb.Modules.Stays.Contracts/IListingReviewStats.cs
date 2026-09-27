namespace Airbnb.Modules.Stays.Contracts;

// Adds a submitted review to a listing's rating and review count. Calling it again with the same review id changes nothing.
public interface IListingReviewStats
{
    Task ApplyReviewAsync(string reviewId, string listingId, int rating, CancellationToken cancellationToken);
}
