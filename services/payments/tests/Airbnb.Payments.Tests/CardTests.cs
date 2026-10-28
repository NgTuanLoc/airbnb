using Airbnb.Payments.Cards;

namespace Airbnb.Payments.Tests;

public sealed class CardTests
{
    private static readonly DateOnly Today = new(2026, 10, 28);

    private static ValidCard? Validate(string number, int month = 12, int year = 2030, string cvc = "123") =>
        CardValidator.Validate(new CardInput(number, month, year, cvc), Today);

    [Theory]
    [InlineData("4242424242424242", "visa", "4242")]
    [InlineData("4242 4242 4242 4242", "visa", "4242")]
    [InlineData("5555555555554444", "mastercard", "4444")]
    [InlineData("378282246310005", "amex", "0005")]
    public void Accepts_valid_cards_and_keeps_only_brand_and_last_four(string number, string brand, string last4)
    {
        var card = Validate(number, cvc: brand == "amex" ? "1234" : "123");

        Assert.NotNull(card);
        Assert.Equal((brand, last4), (card.Brand, card.Last4));
    }

    [Theory]
    [InlineData("4242424242424241")]   // fails Luhn
    [InlineData("4242")]               // too short
    [InlineData("4242-4242-4242-4242x")]
    [InlineData("")]
    public void Refuses_bad_numbers(string number) => Assert.Null(Validate(number));

    [Fact]
    public void Refuses_an_expired_card_but_takes_one_expiring_this_month()
    {
        Assert.Null(Validate("4242424242424242", month: 9, year: 2026));
        Assert.NotNull(Validate("4242424242424242", month: 10, year: 2026));
        Assert.Null(Validate("4242424242424242", month: 13, year: 2030));
    }

    [Theory]
    [InlineData("12")]
    [InlineData("12a")]
    [InlineData("12345")]
    public void Refuses_a_bad_cvc(string cvc) => Assert.Null(Validate("4242424242424242", cvc: cvc));
}
