using System.Diagnostics;
using System.Text.Json.Serialization;

namespace Airbnb.SharedKernel;

// The wire envelope shared with the frontend: { success, data?, error?, meta?, code?, traceId? }.
// Null members are omitted because the frontend's Zod schemas reject null for optional fields.
// Code is a stable, machine-readable reason for a failure the frontend has to tell apart (e.g. "account_exists").
public sealed record ApiResponse<T>(
    bool Success,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] T? Data = default,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Error = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] PageMeta? Meta = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Code = null)
{
    // The trace of the request writing it, to find the call in the dashboard's Traces when debugging (the X-Trace-Id
    // header carries the same id). Read as it's written, not as it's built, so a cached envelope names its own request.
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? TraceId => Activity.Current?.TraceId.ToHexString();
}

public sealed record PageMeta(int Total, int Page, int Limit);

public static class ApiResponse
{
    public static ApiResponse<T> Ok<T>(T data, PageMeta? meta = null) => new(true, data, null, meta);

    public static ApiResponse<object> Fail(string error, string? code = null) => new(false, null, error, null, code);
}
