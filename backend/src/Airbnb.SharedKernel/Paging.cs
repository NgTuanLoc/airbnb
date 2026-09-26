using Microsoft.EntityFrameworkCore;

namespace Airbnb.SharedKernel;

public static class Paging
{
    public const int DefaultPage = 1;
    public const int DefaultLimit = 50;
    public const int MaxLimit = 100;

    // One page of an ordered query plus the { total, page, limit } meta the frontend envelope carries.
    public static async Task<ApiResponse<IReadOnlyList<T>>> ToPageAsync<T>(
        this IQueryable<T> orderedQuery, int page, int limit, CancellationToken cancellationToken)
    {
        var total = await orderedQuery.CountAsync(cancellationToken);
        var items = await orderedQuery.Skip((page - 1) * limit).Take(limit).ToListAsync(cancellationToken);
        return ApiResponse.Ok<IReadOnlyList<T>>(items, new PageMeta(total, page, limit));
    }
}
