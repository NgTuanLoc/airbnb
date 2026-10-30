namespace Airbnb.Modules.Hosts;

// Wire shape of the frontend's Host type.
internal sealed record HostDto(string Id, string Name, string Avatar, bool IsSuperhost, int ResponseRate, int JoinedYear);
