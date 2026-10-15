using System.Text.Json.Serialization;

namespace Airbnb.SharedKernel;

// The wire envelope shared with the frontend: { success, data?, error?, meta?, code? }.
// Null members are omitted because the frontend's Zod schemas reject null for optional fields.
// Code is a stable, machine-readable reason for a failure the frontend has to tell apart (e.g. "account_exists").
public sealed record ApiResponse<T>(
    bool Success,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] T? Data = default,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Error = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] PageMeta? Meta = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Code = null);

public sealed record PageMeta(int Total, int Page, int Limit);

public static class ApiResponse
{
    public static ApiResponse<T> Ok<T>(T data, PageMeta? meta = null) => new(true, data, null, meta);

    public static ApiResponse<object> Fail(string error, string? code = null) => new(false, null, error, null, code);
}
