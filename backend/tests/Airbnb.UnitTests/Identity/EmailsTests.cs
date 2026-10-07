using Airbnb.Modules.Identity;

namespace Airbnb.UnitTests.Identity;

public sealed class EmailsTests
{
    [Theory]
    [InlineData("ana@example.com", "ana@example.com")]
    [InlineData("  Ana@Example.COM ", "ana@example.com")]
    public void Emails_are_trimmed_and_lower_cased(string input, string expected) =>
        Assert.Equal(expected, Emails.Normalize(input));
}
