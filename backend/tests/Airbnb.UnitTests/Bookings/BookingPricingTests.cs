using Airbnb.Modules.Bookings;

namespace Airbnb.UnitTests.Bookings;

// The same cases as frontend/lib/reservation/pricing.test.ts: both sides must price a stay identically.
public sealed class BookingPricingTests
{
    [Theory]
    [InlineData(100, 3, 300, 42, 417)]
    [InlineData(250, 1, 250, 35, 360)]
    [InlineData(95, 7, 665, 93, 833)]
    [InlineData(125, 1, 125, 18, 218)] // 17.5 rounds half away from zero, as Math.round does in JS
    [InlineData(220, 5, 1100, 154, 1329)]
    public void A_stay_is_priced_like_the_frontend(int nightly, int nights, int subtotal, int serviceFee, int total)
    {
        var price = BookingPricing.Calculate(nightly, nights);

        Assert.Equal(subtotal, price.Subtotal);
        Assert.Equal(75, price.CleaningFee);
        Assert.Equal(serviceFee, price.ServiceFee);
        Assert.Equal(total, price.Total);
    }

    [Fact]
    public void The_line_item_labels_match_the_frontend()
    {
        var booking = TestBookings.Confirmed(nightly: 120, nights: 1);

        var labels = BookingDto.From(booking).PriceBreakdown.LineItems.Select(i => i.Label).ToArray();

        Assert.Equal(["$120 x 1 night", "Cleaning fee", "Airbnb service fee"], labels);
        Assert.Equal("$120 x 2 nights", BookingDto.From(TestBookings.Confirmed(nightly: 120, nights: 2)).PriceBreakdown.LineItems[0].Label);
    }
}

internal static class TestBookings
{
    internal static Booking Confirmed(decimal nightly, int nights)
    {
        var price = BookingPricing.Calculate(nightly, nights);
        var checkIn = new DateOnly(2031, 2, 1);
        return new Booking
        {
            Id = "bk_test",
            ListingId = "l13",
            HostId = "h1",
            GuestId = "usr_g",
            GuestName = "Ana",
            GuestEmail = "ana@example.com",
            CheckIn = checkIn,
            CheckOut = checkIn.AddDays(nights),
            Adults = 1,
            Children = 0,
            NightlyPrice = nightly,
            Nights = nights,
            CleaningFee = price.CleaningFee,
            ServiceFee = price.ServiceFee,
            Total = price.Total,
            Status = BookingStatus.Confirmed,
            CreatedAt = DateTimeOffset.UnixEpoch,
        };
    }
}
