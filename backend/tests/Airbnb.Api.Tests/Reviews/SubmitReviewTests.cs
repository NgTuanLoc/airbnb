using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Airbnb.Api.Tests.Infrastructure;

namespace Airbnb.Api.Tests.Reviews;

// Posts reviews for l12 and e11, which no read test asserts on.
public sealed class SubmitReviewTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private const string ValidBody = """{"subjectType":"stay","subjectId":"l12","authorName":"Ana","rating":4,"body":"Lovely stay."}""";

    [Fact]
    public async Task A_valid_review_gets_201_with_the_stored_review()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await PostAsync(client,
            """{"subjectType":"stay","subjectId":"l12","authorName":"  Ana  ","rating":4,"body":"  Lovely stay.  "}""");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var review = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("data");
        Assert.Equal(7, Guid.Parse(review.GetProperty("id").GetString()!).Version);
        Assert.Equal("stay", review.GetProperty("subjectType").GetString());
        Assert.Equal("l12", review.GetProperty("subjectId").GetString());
        Assert.Equal("Ana", review.GetProperty("authorName").GetString());
        Assert.StartsWith("https://images.unsplash.com/", review.GetProperty("authorAvatar").GetString());
        Assert.Equal(4, review.GetProperty("rating").GetInt32());
        Assert.Equal("Lovely stay.", review.GetProperty("body").GetString());
        Assert.InRange(review.GetProperty("createdAt").GetDateTimeOffset(), DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddMinutes(1));
    }

    [Fact]
    public async Task A_new_review_shows_up_first_even_when_the_list_was_cached()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();
        var before = await client.GetFromJsonAsync<JsonElement>("/api/reviews?subjectId=e11", Ct); // puts the list in the cache

        using var response = await PostAsync(client,
            """{"subjectType":"experience","subjectId":"e11","authorName":"Kai","rating":5,"body":"Great guide."}""");
        var posted = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("data").GetProperty("id").GetString();

        var after = await client.GetFromJsonAsync<JsonElement>("/api/reviews?subjectId=e11", Ct);
        Assert.Equal(posted, after.Ids()[0]);
        Assert.Equal(before.GetProperty("meta").GetProperty("total").GetInt32() + 1, after.GetProperty("meta").GetProperty("total").GetInt32());
    }

    [Theory]
    [InlineData("stay", "l999", "Listing 'l999' was not found")]
    [InlineData("experience", "e999", "Experience 'e999' was not found")]
    [InlineData("experience", "l3", "Experience 'l3' was not found")]
    [InlineData("stay", "e2", "Listing 'e2' was not found")]
    public async Task Unknown_subjects_get_the_404_envelope(string subjectType, string subjectId, string error)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await PostAsync(client, With(("subjectType", $"\"{subjectType}\""), ("subjectId", $"\"{subjectId}\"")));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal($$"""{"success":false,"error":"{{error}}"}""", await response.Content.ReadAsStringAsync(Ct));
    }

    // Each value is a JSON literal that replaces one field of a valid body.
    public static TheoryData<string, string> InvalidFields => new()
    {
        { "subjectType", "\"service\"" },
        { "subjectType", "null" },
        { "subjectId", "\"\"" },
        { "subjectId", $"\"{new string('x', 51)}\"" },
        { "authorName", "\"   \"" },
        { "authorName", $"\"{new string('a', 61)}\"" },
        { "rating", "0" },
        { "rating", "6" },
        { "body", "\"\"" },
        { "body", $"\"{new string('b', 1001)}\"" },
    };

    [Theory]
    [MemberData(nameof(InvalidFields))]
    public async Task Invalid_fields_get_the_400_envelope_naming_the_field(string field, string json)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await PostAsync(client, With((field, json)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.False(body.GetProperty("success").GetBoolean());
        Assert.StartsWith($"{char.ToUpperInvariant(field[0])}{field[1..]}:", body.GetProperty("error").GetString());
    }

    [Theory]
    [InlineData("""{"subjectType":"stay","subjectId":"l12","authorName":"Ana","rating":4.5,"body":"b"}""")]
    [InlineData("""{"subjectType":"stay","subjectId":"l12","authorName":"Ana","rating":"five","body":"b"}""")]
    [InlineData("""{not json""")]
    [InlineData("")]
    public async Task Unparsable_bodies_get_the_400_envelope(string json)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var response = await PostAsync(client, json);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("""{"success":false,"error":"Bad Request"}""", await response.Content.ReadAsStringAsync(Ct));
    }

    private static Task<HttpResponseMessage> PostAsync(HttpClient client, string json) =>
        client.PostAsync("/api/reviews", new StringContent(json, Encoding.UTF8, "application/json"), Ct);

    // A valid body with some fields replaced by raw JSON values.
    private static string With(params (string Field, string Json)[] overrides)
    {
        var body = JsonNode.Parse(ValidBody)!.AsObject();
        foreach (var (field, json) in overrides)
        {
            body[field] = JsonNode.Parse(json);
        }

        return body.ToJsonString();
    }
}
