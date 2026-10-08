using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using static Airbnb.Api.Tests.Bookings.BookingRequests;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Airbnb.Api.Tests.Bookings;

// Books only l13–l16, each test in its own random far-future month, so runs never collide.
public sealed class CreateBookingTests(InfrastructureFixture infrastructure)
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private WebApplicationFactory<Program> Factory() => BookingRequests.Factory(infrastructure);

    [Fact]
    public async Task A_catalog_booking_is_priced_on_the_server_whatever_the_quote_says()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, userId, email) = await AuthHelpers.RegisterAsync(client, "Ana");
        var listing = (await client.GetFromJsonAsync<JsonElement>("/api/listings/l13", Ct)).GetProperty("data");
        var nightly = listing.GetProperty("pricePerNight").GetDecimal();

        using var response = await BookAsync(client, token, Stay("l13", RandomMonth(), 3, quote: new { hostId = "x", pricePerNight = 1, maxGuests = 16 }));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var booking = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("data");
        Assert.StartsWith("bk_", booking.GetProperty("id").GetString());
        Assert.Equal(listing.GetProperty("hostId").GetString(), booking.GetProperty("hostId").GetString());
        Assert.Equal(userId, booking.GetProperty("guestId").GetString());
        Assert.Equal("Ana", booking.GetProperty("guestName").GetString());
        Assert.Equal(email, booking.GetProperty("guestEmail").GetString());
        Assert.Equal("confirmed", booking.GetProperty("status").GetString());
        var subtotal = nightly * 3;
        var serviceFee = Math.Round(subtotal * 0.14m, MidpointRounding.AwayFromZero);
        Assert.Equal(subtotal + 75 + serviceFee, booking.GetProperty("priceBreakdown").GetProperty("total").GetDecimal());
    }

    [Fact]
    public async Task A_host_listing_needs_a_quote_and_is_priced_from_it()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, _, _) = await AuthHelpers.RegisterAsync(client);
        var listingId = $"hl-{Guid.NewGuid()}";
        var month = RandomMonth();

        using var withoutQuote = await BookAsync(client, token, Stay(listingId, month, 2));
        using var withQuote = await BookAsync(client, token, Stay(listingId, month, 2, quote: new { hostId = "usr_host", pricePerNight = 100, maxGuests = 4 }));

        Assert.Equal(HttpStatusCode.BadRequest, withoutQuote.StatusCode);
        Assert.Equal("A quote is required for host listings", await ErrorAsync(withoutQuote));
        Assert.Equal(HttpStatusCode.Created, withQuote.StatusCode);
        var booking = (await withQuote.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("data");
        Assert.Equal("usr_host", booking.GetProperty("hostId").GetString());
        Assert.Equal(303m, booking.GetProperty("priceBreakdown").GetProperty("total").GetDecimal()); // 200 + 75 + 28
    }

    [Theory]
    [InlineData(null)]
    [InlineData("wrong-key")]
    public async Task A_quote_without_the_right_key_is_refused(string? key)
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, _, _) = await AuthHelpers.RegisterAsync(client);

        using var response = await BookAsync(client, token,
            Stay($"hl-{Guid.NewGuid()}", RandomMonth(), 2, quote: new { hostId = "usr_host", pricePerNight = 100, maxGuests = 4 }), key);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("A quote is required for host listings", await ErrorAsync(response));
    }

    [Fact]
    public async Task With_no_key_configured_every_quote_is_refused()
    {
        await using var factory = BookingRequests.Factory(infrastructure, quoteKey: null);
        using var client = factory.CreateClient();
        var (token, _, _) = await AuthHelpers.RegisterAsync(client);

        using var response = await BookAsync(client, token,
            Stay($"hl-{Guid.NewGuid()}", RandomMonth(), 2, quote: new { hostId = "usr_host", pricePerNight = 100, maxGuests = 4 }), "anything");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("A quote is required for host listings", await ErrorAsync(response));
    }

    [Fact]
    public async Task A_quoted_price_under_one_is_refused()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, _, _) = await AuthHelpers.RegisterAsync(client);

        using var response = await BookAsync(client, token,
            Stay($"hl-{Guid.NewGuid()}", RandomMonth(), 2, quote: new { hostId = "usr_host", pricePerNight = 0.6, maxGuests = 4 }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Overlapping_nights_get_409_and_back_to_back_stays_are_fine()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (first, _, _) = await AuthHelpers.RegisterAsync(client);
        var (second, _, _) = await AuthHelpers.RegisterAsync(client);
        var month = RandomMonth();

        using var booked = await BookAsync(client, first, Stay("l14", month, 3));
        using var overlapping = await BookAsync(client, second, Stay("l14", month.AddDays(2), 3));
        using var backToBack = await BookAsync(client, second, Stay("l14", month.AddDays(3), 2));

        Assert.Equal(HttpStatusCode.Created, booked.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, overlapping.StatusCode);
        Assert.Equal("Those dates were just booked. Pick different dates.", await ErrorAsync(overlapping));
        Assert.Equal(HttpStatusCode.Created, backToBack.StatusCode);
    }

    // Chain-overlap races (A=1-5, B=3-8, C=7-10) aren't covered: they can't be made deterministic.
    [Fact]
    public async Task Concurrent_overlapping_bookings_give_exactly_one_201()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var guests = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => AuthHelpers.RegisterAsync(client)));
        var month = RandomMonth();

        var responses = await Task.WhenAll(guests.Select(g => BookAsync(client, g.Token, Stay("l15", month, 4))));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(4, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        foreach (var response in responses) response.Dispose();
    }

    [Theory]
    [InlineData("2031-02-30", 2, "Dates must be YYYY-MM-DD")]
    [InlineData("2000-01-01", 2, "Check-in can't be in the past")]
    [InlineData(null, 0, "Check-out must be after check-in")]
    [InlineData(null, 31, "Stays can be at most 30 nights")]
    public async Task Bad_dates_get_400(string? checkIn, int nights, string error)
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, _, _) = await AuthHelpers.RegisterAsync(client);
        var start = RandomMonth();
        var body = checkIn is null
            ? Stay("l16", start, nights)
            : new { listingId = "l16", checkIn, checkOut = "2031-03-05", adults = 1, children = 0 };

        using var response = await BookAsync(client, token, body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(error, await ErrorAsync(response));
    }

    [Fact]
    public async Task Too_many_guests_an_unknown_listing_and_your_own_listing_are_refused()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, userId, _) = await AuthHelpers.RegisterAsync(client);
        var month = RandomMonth();

        using var tooMany = await BookAsync(client, token, Stay("l16", month, 1, adults: 16));
        using var unknown = await BookAsync(client, token, Stay("l999", month, 1));
        using var own = await BookAsync(client, token, Stay($"hl-{Guid.NewGuid()}", month, 1, quote: new { hostId = userId, pricePerNight = 50, maxGuests = 2 }));

        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
        Assert.StartsWith("This place allows at most", await ErrorAsync(tooMany));
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal("Listing 'l999' was not found", await ErrorAsync(unknown));
        Assert.Equal(HttpStatusCode.BadRequest, own.StatusCode);
        Assert.Equal("You can't book your own listing", await ErrorAsync(own));
    }

    [Fact]
    public async Task Booking_without_a_session_gets_401()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        using var response = await client.PostAsync("/api/bookings",
            new StringContent(JsonSerializer.Serialize(Stay("l16", RandomMonth(), 1)), Encoding.UTF8, "application/json"), Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Availability_lists_the_confirmed_future_stays_without_a_session()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var (token, _, _) = await AuthHelpers.RegisterAsync(client);
        var listingId = $"hl-{Guid.NewGuid()}";
        var month = RandomMonth();
        var quote = new { hostId = "usr_host", pricePerNight = 80, maxGuests = 2 };
        using var a = await BookAsync(client, token, Stay(listingId, month, 2, quote: quote));
        using var b = await BookAsync(client, token, Stay(listingId, month.AddDays(5), 1, quote: quote));

        var stays = await client.GetFromJsonAsync<JsonElement>($"/api/bookings/availability?listingId={listingId}", Ct);

        var data = stays.GetProperty("data").EnumerateArray().Select(s => (s.GetProperty("checkIn").GetString(), s.GetProperty("checkOut").GetString())).ToArray();
        Assert.Equal(
            [(month.ToString("yyyy-MM-dd"), month.AddDays(2).ToString("yyyy-MM-dd")), (month.AddDays(5).ToString("yyyy-MM-dd"), month.AddDays(6).ToString("yyyy-MM-dd"))],
            data);
    }
}
