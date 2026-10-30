using System.Text.Json.Serialization;

namespace Airbnb.Modules.Identity.External;

internal static partial class ListConnections
{
    // Email and ConnectedAt only when connected. Kind is "social" or "sso".
    internal sealed record ConnectionDto(
        string Provider,
        string Name,
        string Kind,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Email,
        [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] DateTimeOffset? ConnectedAt);

    internal sealed record ConnectionsDto(bool HasPassword, IReadOnlyList<ConnectionDto> Connections);
}
