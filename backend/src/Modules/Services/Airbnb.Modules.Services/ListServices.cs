using System.ComponentModel.DataAnnotations;
using System.Globalization;
using Airbnb.Modules.Services.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Services;

internal static class ListServices
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query(
        [property: StringLength(50)] string? Category,
        [property: Range(1, Paging.MaxPage)] int Page = Paging.DefaultPage,
        [property: Range(1, Paging.MaxLimit)] int Limit = Paging.DefaultLimit);

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

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/services", async ([AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            TypedResults.Ok(await handler.HandleAsync(query, cancellationToken)));
}
