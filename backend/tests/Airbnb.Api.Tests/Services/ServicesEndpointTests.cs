using System.Net;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Services;

public sealed class ServicesEndpointTests(InfrastructureFixture infrastructure)
{
    [Fact]
    public async Task Services_return_all_twelve_in_mock_order_with_paging_meta()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/services");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(Enumerable.Range(1, 12).Select(n => $"s{n}"), body.Ids());
        Assert.Equal(12, body.GetProperty("meta").GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Category_filter_matches_the_service_category_like_the_mock()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/services?category=Photography");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(new[] { "s1", "s6", "s11" }, body.Ids());
    }

    [Fact]
    public async Task Service_json_matches_the_frontend_service_shape()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/services/s1");

        Assert.Equal(HttpStatusCode.OK, status);
        var service = body.GetProperty("data");
        Assert.Equal("Portrait photography session", service.GetProperty("title").GetString());
        Assert.Equal("Mara Lensworth", service.GetProperty("provider").GetString());
        Assert.Equal("Photography", service.GetProperty("serviceCategory").GetString());
        Assert.Equal(180m, service.GetProperty("price").GetDecimal());
        Assert.Equal("Lisbon", service.GetProperty("city").GetString());
        Assert.False(service.TryGetProperty("sortOrder", out _));
    }

    [Fact]
    public async Task Unknown_service_gets_the_404_envelope()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/services/s999");

        Assert.Equal(HttpStatusCode.NotFound, status);
        Assert.Equal("Service 's999' was not found", body.GetProperty("error").GetString());
    }
}
