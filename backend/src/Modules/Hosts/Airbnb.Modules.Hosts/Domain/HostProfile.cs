namespace Airbnb.Modules.Hosts;

// Named HostProfile to avoid clashing with Microsoft.Extensions.Hosting.Host.
internal sealed class HostProfile
{
    public required string Id { get; init; }

    public required string Name { get; init; }

    public required string Avatar { get; init; }

    public bool IsSuperhost { get; init; }

    public int ResponseRate { get; init; }

    public int JoinedYear { get; init; }
}
