namespace Airbnb.Api.Tests.Infrastructure;

// A clock a test can move forward, swapped in for TimeProvider.System.
public sealed class MutableTimeProvider(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;

    public override DateTimeOffset GetUtcNow() => Now;
}
