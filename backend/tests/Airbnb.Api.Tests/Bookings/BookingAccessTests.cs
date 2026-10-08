using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using static Airbnb.Api.Tests.Bookings.BookingRequests;

namespace Airbnb.Api.Tests.Bookings;

public sealed class BookingAccessTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private WebApplicationFactory<Program> Factory() => BookingRequests.Factory(infrastructure);

    private static async Task<HttpResponseMessage> SendAsync(HttpClient client, HttpMethod method, string path, string? token)
    {
        using var request = new HttpRequestMessage(method, path);
        if (token is not null) request.Authorized(token);
        return await client.SendAsync(request, Ct);
    }

    private static async Task<JsonElement> DataAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("data");

    private static async Task<string[]> IdsAsync(HttpClient client, string path, string token)
    {
        using var response = await SendAsync(client, HttpMethod.Get, path, token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await DataAsync(response)).EnumerateArray().Select(b => b.GetProperty("id").GetString()!).ToArray();
    }

    private static async Task<string> BookHostListingAsync(HttpClient client, string guestToken, string hostId, DateOnly checkIn, string? listingId = null)
    {
        using var response = await BookAsync(client, guestToken,
            Stay(listingId ?? $"hl-{Guid.NewGuid()}", checkIn, 3, quote: new { hostId, pricePerNight = 100, maxGuests = 4 }));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await DataAsync(response)).GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task Guests_see_their_trips_hosts_see_their_reservations_and_strangers_see_nothing()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var host = await AuthHelpers.RegisterAsync(client, "Hana");
        var guest = await AuthHelpers.RegisterAsync(client, "Gus");
        var stranger = await AuthHelpers.RegisterAsync(client, "Sam");
        var id = await BookHostListingAsync(client, guest.Token, host.UserId, RandomMonth());

        Assert.Contains(id, await IdsAsync(client, "/api/bookings/mine", guest.Token));
        Assert.DoesNotContain(id, await IdsAsync(client, "/api/bookings/mine", stranger.Token));
        Assert.Contains(id, await IdsAsync(client, "/api/bookings/hosting", host.Token));
        Assert.DoesNotContain(id, await IdsAsync(client, "/api/bookings/hosting", guest.Token));

        using var hosting = await SendAsync(client, HttpMethod.Get, "/api/bookings/hosting", host.Token);
        var row = (await DataAsync(hosting)).EnumerateArray().Single(b => b.GetProperty("id").GetString() == id);
        Assert.Equal(guest.Email, row.GetProperty("guestEmail").GetString());

        using var asGuest = await SendAsync(client, HttpMethod.Get, $"/api/bookings/{id}", guest.Token);
        using var asHost = await SendAsync(client, HttpMethod.Get, $"/api/bookings/{id}", host.Token);
        using var asStranger = await SendAsync(client, HttpMethod.Get, $"/api/bookings/{id}", stranger.Token);
        Assert.Equal(HttpStatusCode.OK, asGuest.StatusCode);
        Assert.Equal(HttpStatusCode.OK, asHost.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, asStranger.StatusCode);
        Assert.Equal("Booking not found", await ErrorAsync(asStranger));
    }

    [Fact]
    public async Task A_guest_can_cancel_before_check_in_and_the_nights_free_up()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var host = await AuthHelpers.RegisterAsync(client);
        var guest = await AuthHelpers.RegisterAsync(client);
        var other = await AuthHelpers.RegisterAsync(client);
        var month = RandomMonth();
        var listingId = $"hl-{Guid.NewGuid()}";
        var id = await BookHostListingAsync(client, guest.Token, host.UserId, month, listingId);

        using var cancelled = await SendAsync(client, HttpMethod.Post, $"/api/bookings/{id}/cancel", guest.Token);
        using var again = await SendAsync(client, HttpMethod.Post, $"/api/bookings/{id}/cancel", guest.Token);
        using var rebooked = await BookAsync(client, other.Token,
            Stay(listingId, month, 3, quote: new { hostId = host.UserId, pricePerNight = 100, maxGuests = 4 }));
        var stays = await client.GetFromJsonAsync<JsonElement>($"/api/bookings/availability?listingId={listingId}", Ct);

        Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
        var data = await DataAsync(cancelled);
        Assert.Equal("cancelled", data.GetProperty("status").GetString());
        Assert.NotEqual(JsonValueKind.Null, data.GetProperty("cancelledAt").ValueKind);
        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal("cancelled", (await DataAsync(again)).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Created, rebooked.StatusCode);
        Assert.Single(stays.GetProperty("data").EnumerateArray()); // only the rebooking, not the cancelled stay
    }

    [Fact]
    public async Task Strangers_and_hosts_cannot_cancel_a_guests_booking()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var host = await AuthHelpers.RegisterAsync(client);
        var guest = await AuthHelpers.RegisterAsync(client);
        var stranger = await AuthHelpers.RegisterAsync(client);
        var id = await BookHostListingAsync(client, guest.Token, host.UserId, RandomMonth());

        using var asStranger = await SendAsync(client, HttpMethod.Post, $"/api/bookings/{id}/cancel", stranger.Token);
        using var asHost = await SendAsync(client, HttpMethod.Post, $"/api/bookings/{id}/cancel", host.Token);
        using var check = await SendAsync(client, HttpMethod.Get, $"/api/bookings/{id}", guest.Token);

        Assert.Equal(HttpStatusCode.NotFound, asStranger.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, asHost.StatusCode);
        Assert.Equal("confirmed", (await DataAsync(check)).GetProperty("status").GetString());
    }

    [Fact]
    public async Task A_trip_that_has_started_cannot_be_cancelled()
    {
        var clock = new MutableTimeProvider(DateTimeOffset.UtcNow);
        await using var factory = Factory().WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services => services.AddSingleton<TimeProvider>(clock)));
        using var client = factory.CreateClient();
        var host = await AuthHelpers.RegisterAsync(client);
        var guest = await AuthHelpers.RegisterAsync(client);
        var checkIn = DateOnly.FromDateTime(clock.Now.UtcDateTime).AddDays(5);
        var id = await BookHostListingAsync(client, guest.Token, host.UserId, checkIn);

        clock.Now = clock.Now.AddDays(5);
        using var response = await SendAsync(client, HttpMethod.Post, $"/api/bookings/{id}/cancel", guest.Token);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("This trip has already started", await ErrorAsync(response));
    }

    [Theory]
    [InlineData("GET", "/api/bookings/mine")]
    [InlineData("GET", "/api/bookings/hosting")]
    [InlineData("GET", "/api/bookings/bk_x")]
    [InlineData("POST", "/api/bookings/bk_x/cancel")]
    public async Task Booking_endpoints_need_a_session(string method, string path)
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        using var response = await SendAsync(client, new HttpMethod(method), path, null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
