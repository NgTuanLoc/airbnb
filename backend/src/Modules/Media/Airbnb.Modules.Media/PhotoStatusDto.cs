using System.Text.Json.Serialization;

namespace Airbnb.Modules.Media;

internal sealed record PhotoStatusDto(
    string Id,
    string Status,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Reason)
{
    public const string Pending = "pending";
    public const string Ready = "ready";
    public const string Rejected = "rejected";
}
