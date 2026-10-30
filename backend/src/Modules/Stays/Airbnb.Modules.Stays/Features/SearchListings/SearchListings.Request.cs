using System.ComponentModel.DataAnnotations;
using Airbnb.SharedKernel;

namespace Airbnb.Modules.Stays.Listings;

internal static partial class SearchListings
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query(
        [property: StringLength(100)] string? Location,
        [property: StringLength(50)] string? Category,
        [property: Range(0d, 100_000d)] decimal? MinPrice,
        [property: Range(0d, 100_000d)] decimal? MaxPrice,
        [property: Range(1, 50)] int? Guests,
        [property: Range(0, 50)] int? Bedrooms,
        [property: Range(0, 50)] int? Beds,
        [property: Range(0d, 50d)] decimal? Baths,
        [property: Range(1, Paging.MaxPage)] int Page = Paging.DefaultPage,
        [property: Range(1, Paging.MaxLimit)] int Limit = Paging.DefaultLimit);
}
