using System.Net;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Hosts;

public sealed class HostsEndpointTests(InfrastructureFixture infrastructure)
{
    [Fact]
    public async Task Host_json_matches_the_frontend_host_shape()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/hosts/h1");

        Assert.Equal(HttpStatusCode.OK, status);
        var host = body.GetProperty("data");
        Assert.Equal("h1", host.GetProperty("id").GetString());
        Assert.Equal("Maya", host.GetProperty("name").GetString());
        Assert.StartsWith("https://images.unsplash.com/", host.GetProperty("avatar").GetString());
        Assert.True(host.GetProperty("isSuperhost").GetBoolean());
        Assert.Equal(100, host.GetProperty("responseRate").GetInt32());
        Assert.Equal(2016, host.GetProperty("joinedYear").GetInt32());
    }

    [Fact]
    public async Task Unknown_host_gets_the_404_envelope()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/hosts/h999");

        Assert.Equal(HttpStatusCode.NotFound, status);
        Assert.Equal("Host 'h999' was not found", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task An_id_longer_than_50_characters_gets_the_400_envelope()
    {
        var (status, body) = await infrastructure.GetJsonAsync($"/api/hosts/{new string('h', 51)}");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.StartsWith("Id:", body.GetProperty("error").GetString());
    }
}
