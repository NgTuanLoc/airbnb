using Airbnb.Modules.Hosts.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Hosts;

internal static partial class GetHost
{
    internal sealed class Handler(HostsDbContext db, HybridCache cache)
    {
        public ValueTask<HostDto?> HandleAsync(Query query, CancellationToken cancellationToken) =>
            cache.GetOrCreateAsync(
                $"hosts:host:{query.Id}",
                async token => await db.Hosts.AsNoTracking()
                    .Where(h => h.Id == query.Id)
                    .Select(h => new HostDto(h.Id, h.Name, h.Avatar, h.IsSuperhost, h.ResponseRate, h.JoinedYear))
                    .FirstOrDefaultAsync(token),
                tags: [HostsModule.CacheTag],
                cancellationToken: cancellationToken);
    }
}
