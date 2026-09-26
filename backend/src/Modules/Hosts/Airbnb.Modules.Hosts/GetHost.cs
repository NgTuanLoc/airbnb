using System.ComponentModel.DataAnnotations;
using Airbnb.Modules.Hosts.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Hosts;

// Wire shape of the frontend's Host type.
internal sealed record HostDto(string Id, string Name, string Avatar, bool IsSuperhost, int ResponseRate, int JoinedYear);

internal static class GetHost
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query([property: StringLength(50, MinimumLength = 1)] string Id);

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

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/hosts/{id}", async Task<Results<Ok<ApiResponse<HostDto>>, NotFound<ApiResponse<object>>>> (
            [AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(query, cancellationToken) is { } host
                ? TypedResults.Ok(ApiResponse.Ok(host))
                : TypedResults.NotFound(ApiResponse.Fail($"Host '{query.Id}' was not found")));
}
