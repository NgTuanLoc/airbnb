using Airbnb.Modules.Insights;

namespace Airbnb.UnitTests.Insights;

public sealed class ListingIdsTests
{
    [Theory]
    [InlineData("l1")]
    [InlineData("l16")]
    [InlineData("l123456")]
    [InlineData("hl-0192f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a")]
    public void Accepts_seed_and_host_listing_ids(string id) => Assert.True(ListingIds.IsValid(id));

    [Theory]
    [InlineData("")]
    [InlineData("..")]
    [InlineData("l")]
    [InlineData("L1")]
    [InlineData("l1234567")]
    [InlineData("hl-x")]
    [InlineData("hl-0192F3A4-B5C6-4D7E-8F9A-0B1C2D3E4F5A")]
    [InlineData("l1/../l2")]
    [InlineData("l1\n")]
    public void Refuses_anything_else(string id) => Assert.False(ListingIds.IsValid(id));
}
