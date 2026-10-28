namespace Airbnb.Payments.Cards;

public sealed record CardInput(string? Number, int ExpMonth, int ExpYear, string? Cvc);

// A card that passed validation. Number lives only in memory for the processor's decision; Brand and Last4 are all that
// is ever stored or returned.
public sealed record ValidCard(string Number, string Brand, string Last4);

public static class CardValidator
{
    // Null when the number fails the Luhn check, the expiry has passed or the CVC is malformed. Spaces are allowed in the
    // number, nothing else.
    public static ValidCard? Validate(CardInput card, DateOnly today)
    {
        var digits = (card.Number ?? "").Replace(" ", "");
        if (digits.Length is < 13 or > 19 || !digits.All(char.IsAsciiDigit) || !PassesLuhn(digits))
        {
            return null;
        }
        if (card.ExpMonth is < 1 or > 12 || (card.ExpYear, card.ExpMonth).CompareTo((today.Year, today.Month)) < 0)
        {
            return null;
        }
        var brand = digits[0] switch { '4' => "visa", '5' => "mastercard", '3' => "amex", _ => "card" };
        var cvcLength = brand == "amex" ? 4 : 3;
        if (card.Cvc is not { } cvc || cvc.Length != cvcLength || !cvc.All(char.IsAsciiDigit))
        {
            return null;
        }
        return new ValidCard(digits, brand, digits[^4..]);
    }

    private static bool PassesLuhn(string digits)
    {
        var sum = 0;
        for (var i = 0; i < digits.Length; i++)
        {
            var digit = digits[digits.Length - 1 - i] - '0';
            if (i % 2 == 1)
            {
                digit *= 2;
                if (digit > 9)
                {
                    digit -= 9;
                }
            }
            sum += digit;
        }
        return sum % 10 == 0;
    }
}
