using System.Net;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Stays;

public sealed class StaysEndpointTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Listings_return_every_seeded_listing_in_mock_order_with_paging_meta()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/listings");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(Enumerable.Range(1, 16).Select(n => $"l{n}"), body.Ids());
        Assert.Equal(16, body.GetProperty("meta").GetProperty("total").GetInt32());
        Assert.Equal(1, body.GetProperty("meta").GetProperty("page").GetInt32());
        Assert.Equal(50, body.GetProperty("meta").GetProperty("limit").GetInt32());
    }

    [Fact]
    public async Task Listing_json_matches_the_frontend_listing_shape()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/listings/l1");

        Assert.Equal(HttpStatusCode.OK, status);
        var listing = body.GetProperty("data");
        Assert.Equal("Cozy cabin in the pines", listing.GetProperty("title").GetString());
        Assert.Equal("Aspen", listing.GetProperty("location").GetProperty("city").GetString());
        Assert.Equal(39.19, listing.GetProperty("location").GetProperty("lat").GetDouble());
        Assert.Equal(220m, listing.GetProperty("pricePerNight").GetDecimal());
        Assert.Equal(5, listing.GetProperty("photos").GetArrayLength());
        Assert.Equal(6, listing.GetProperty("amenities").GetArrayLength());
        Assert.False(listing.TryGetProperty("sortOrder", out _));
    }

    [Theory]
    [InlineData("?location=aspen", new[] { "l1", "l6", "l8", "l15" })]
    [InlineData("?location=ASPEN&category=Cabins", new[] { "l1", "l8", "l15" })]
    [InlineData("?minPrice=300&maxPrice=400", new[] { "l4", "l13", "l16" })]
    [InlineData("?guests=8", new[] { "l2" })]
    [InlineData("?minPrice=500&maxPrice=100", new string[0])]
    public async Task Filters_match_the_mock_repository(string query, string[] expectedIds)
    {
        var (status, body) = await infrastructure.GetJsonAsync($"/api/listings{query}");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(expectedIds, body.Ids());
    }

    [Fact]
    public async Task Paging_returns_the_requested_slice_and_the_full_total()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/listings?page=2&limit=5");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(new[] { "l6", "l7", "l8", "l9", "l10" }, body.Ids());
        Assert.Equal(16, body.GetProperty("meta").GetProperty("total").GetInt32());
    }

    [Theory]
    [InlineData("?limit=0", "Limit")]
    [InlineData("?limit=101", "Limit")]
    [InlineData("?minPrice=-5", "MinPrice")]
    [InlineData("?guests=0", "Guests")]
    public async Task Out_of_range_queries_get_the_400_envelope_naming_the_field(string query, string field)
    {
        var (status, body) = await infrastructure.GetJsonAsync($"/api/listings{query}");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.False(body.GetProperty("success").GetBoolean());
        Assert.StartsWith($"{field}:", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Unknown_listing_gets_the_404_envelope()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/listings/l999");

        Assert.Equal(HttpStatusCode.NotFound, status);
        Assert.Equal("Listing 'l999' was not found", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Cities_return_all_six_in_mock_order_without_paging()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/cities");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(new[] { "wilmington", "athens", "aspen", "malibu", "kyoto", "lisbon" }, body.Ids());
        Assert.False(body.TryGetProperty("meta", out _));
    }

    [Fact]
    public async Task Listings_are_still_served_when_redis_is_unreachable()
    {
        await using var factory = new ApiFactory(infrastructure.PostgresConnectionString, "127.0.0.1:1,abortConnect=false,connectTimeout=200");
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/listings/l1", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
