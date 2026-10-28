using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MongoDB.Bson;
using MongoDB.Driver;
using static Airbnb.Chat.Tests.Integration.ChatFixture;

namespace Airbnb.Chat.Tests.Integration;

// Conversations start only through the Next server, which vouches for the listing's host (chat spec).
public sealed class ConversationTests(ChatFixture fixture)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData(null)]
    [InlineData("not-the-key")]
    public async Task Creating_a_conversation_needs_the_service_key(string? key)
    {
        using var client = fixture.Client(serviceKey: key);

        using var response = await client.PostAsJsonAsync("/conversations", Start(NewListingId(), NewUserId(), NewUserId()), Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task A_conversation_is_created_once_per_listing_and_guest()
    {
        var (listing, host, guest) = (NewListingId(), NewUserId(), NewUserId());

        var first = await fixture.StartConversationAsync(listing, host, guest, Ct);
        var again = await fixture.StartConversationAsync(listing, host, guest, Ct);
        var otherGuest = await fixture.StartConversationAsync(listing, host, NewUserId(), Ct);

        Assert.StartsWith("cv_", first);
        Assert.Equal(first, again);
        Assert.NotEqual(first, otherGuest);
    }

    [Fact]
    public async Task Concurrent_starts_make_one_conversation()
    {
        var (listing, host, guest) = (NewListingId(), NewUserId(), NewUserId());

        var ids = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => fixture.StartConversationAsync(listing, host, guest, Ct)));

        Assert.Single(ids.Distinct());
        var stored = await fixture.Database.GetCollection<BsonDocument>("conversations")
            .CountDocumentsAsync(new BsonDocument { ["ListingId"] = listing, ["GuestId"] = guest }, cancellationToken: Ct);
        Assert.Equal(1, stored);
    }

    [Fact]
    public async Task You_cannot_message_yourself()
    {
        var user = NewUserId();
        using var client = fixture.Client();

        using var response = await client.PostAsJsonAsync("/conversations", Start(NewListingId(), user, user), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Missing_fields_are_refused()
    {
        using var client = fixture.Client();

        using var response = await client.PostAsJsonAsync("/conversations", new { listingId = NewListingId(), hostId = NewUserId() }, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("invalid_request", (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("code").GetString());
    }
}
