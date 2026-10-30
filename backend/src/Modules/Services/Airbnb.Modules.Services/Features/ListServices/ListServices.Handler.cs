using System.Globalization;
using Airbnb.Modules.Services.Data;
using Airbnb.SharedKernel;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Services;

internal static partial class ListServices
{
    internal sealed class Handler(ServicesDbContext db, HybridCache cache)
    {
        public ValueTask<ApiResponse<IReadOnlyList<ServiceDto>>> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                string.Create(CultureInfo.InvariantCulture, $"services:list:{query.Category}|{query.Page}|{query.Limit}"),
                async token => await db.Services.AsNoTracking()
                    .Where(s => string.IsNullOrWhiteSpace(query.Category) || s.ServiceCategory == query.Category)
                    .OrderBy(s => s.SortOrder)
                    .Select(ServiceDto.Projection)
                    .ToPageAsync(query.Page, query.Limit, token),
                tags: [ServicesModule.CacheTag],
                cancellationToken: cancellationToken);
    }
}
