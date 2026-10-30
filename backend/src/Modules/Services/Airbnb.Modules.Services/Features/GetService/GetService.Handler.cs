using Airbnb.Modules.Services.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Services;

internal static partial class GetService
{
    internal sealed class Handler(ServicesDbContext db, HybridCache cache)
    {
        public ValueTask<ServiceDto?> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                $"services:service:{query.Id}",
                async token => await db.Services.AsNoTracking()
                    .Where(s => s.Id == query.Id)
                    .Select(ServiceDto.Projection)
                    .FirstOrDefaultAsync(token),
                tags: [ServicesModule.CacheTag],
                cancellationToken: cancellationToken);
    }
}
