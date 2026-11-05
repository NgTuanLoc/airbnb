using System.Security.Cryptography;
using System.Text;
using Airbnb.Payments.Webhooks;

namespace Airbnb.Payments.Tests;

public sealed class WebhookSignatureTests
{
    private const string Secret = "whsec_test";
    private static readonly DateTimeOffset Now = new(2026, 11, 5, 12, 0, 0, TimeSpan.Zero);
    private static readonly byte[] Body = Encoding.UTF8.GetBytes("""{"id":"evt_1","type":"charge.succeeded"}""");

    // Computed here, not by the code under test: hex HMAC-SHA256 of "<t>.<body>" with the secret.
    private static string V1(long t, string secret = Secret, byte[]? body = null)
    {
        byte[] signed = [.. Encoding.UTF8.GetBytes($"{t}."), .. body ?? Body];
        return Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), signed));
    }

    private static long At(int minutesFromNow) => Now.AddMinutes(minutesFromNow).ToUnixTimeSeconds();

    [Fact]
    public void The_body_signed_with_the_secret_is_valid() =>
        Assert.True(WebhookSignature.IsValid($"t={At(0)},v1={V1(At(0))}", Body, Secret, Now));

    [Fact]
    public void A_changed_body_is_refused()
    {
        var tampered = Body.ToArray();
        tampered[^3] ^= 1;

        Assert.False(WebhookSignature.IsValid($"t={At(0)},v1={V1(At(0))}", tampered, Secret, Now));
    }

    [Fact]
    public void Another_secret_is_refused() =>
        Assert.False(WebhookSignature.IsValid($"t={At(0)},v1={V1(At(0), "whsec_other")}", Body, Secret, Now));

    [Fact]
    public void The_timestamp_is_part_of_the_signature() =>
        Assert.False(WebhookSignature.IsValid($"t={At(1)},v1={V1(At(0))}", Body, Secret, Now));

    [Theory]
    [InlineData(-6)]
    [InlineData(6)]
    public void A_timestamp_more_than_five_minutes_away_is_refused(int minutes) =>
        Assert.False(WebhookSignature.IsValid($"t={At(minutes)},v1={V1(At(minutes))}", Body, Secret, Now));

    [Theory]
    [InlineData(-4)]
    [InlineData(4)]
    public void A_timestamp_within_five_minutes_is_valid(int minutes) =>
        Assert.True(WebhookSignature.IsValid($"t={At(minutes)},v1={V1(At(minutes))}", Body, Secret, Now));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("v1=00ff")]
    [InlineData("t=1793880000")]
    [InlineData("t=soon,v1=00ff")]
    [InlineData("t=-9223372036854775808,v1=00ff")]
    [InlineData("garbage")]
    public void Malformed_headers_are_refused(string? header) =>
        Assert.False(WebhookSignature.IsValid(header, Body, Secret, Now));

    [Fact]
    public void A_v1_that_is_not_hex_is_refused() =>
        Assert.False(WebhookSignature.IsValid($"t={At(0)},v1=not-hex", Body, Secret, Now));

    // While a secret is replaced, the provider signs with both: either may be the one this side knows.
    [Fact]
    public void Any_v1_may_match() =>
        Assert.True(WebhookSignature.IsValid($"t={At(0)},v1={V1(At(0), "whsec_old")},v1={V1(At(0))}", Body, Secret, Now));
}
