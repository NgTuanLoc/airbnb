using System.Net;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Experiences;

public sealed class ExperiencesEndpointTests(InfrastructureFixture infrastructure)
{
    [Fact]
    public async Task Experiences_return_all_twelve_in_mock_order_with_paging_meta()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/experiences");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(Enumerable.Range(1, 12).Select(n => $"e{n}"), body.Ids());
        Assert.Equal(12, body.GetProperty("meta").GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Category_filter_matches_the_mock_repository()
    {
        var (status, body) = await infrastructure.GetJsonAsync($"/api/experiences?category={Uri.EscapeDataString("Food & drink")}");

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal(new[] { "e1", "e4", "e8", "e12" }, body.Ids());
    }

    [Fact]
    public async Task Experience_json_matches_the_frontend_experience_shape()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/experiences/e1");

        Assert.Equal(HttpStatusCode.OK, status);
        var experience = body.GetProperty("data");
        Assert.Equal("Pasta-making with a Roman nonna", experience.GetProperty("title").GetString());
        Assert.Equal("Rome", experience.GetProperty("location").GetProperty("city").GetString());
        Assert.Equal(65m, experience.GetProperty("pricePerPerson").GetDecimal());
        Assert.Equal(3m, experience.GetProperty("durationHours").GetDecimal());
        Assert.False(experience.GetProperty("isNew").GetBoolean());
        Assert.Equal("h1", experience.GetProperty("hostId").GetString());
        Assert.False(experience.TryGetProperty("sortOrder", out _));
    }

    [Fact]
    public async Task Unknown_experience_gets_the_404_envelope()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/experiences/e999");

        Assert.Equal(HttpStatusCode.NotFound, status);
        Assert.Equal("Experience 'e999' was not found", body.GetProperty("error").GetString());
    }

    [Fact]
    public async Task A_limit_above_100_gets_the_400_envelope()
    {
        var (status, body) = await infrastructure.GetJsonAsync("/api/experiences?limit=101");

        Assert.Equal(HttpStatusCode.BadRequest, status);
        Assert.StartsWith("Limit:", body.GetProperty("error").GetString());
    }
}
