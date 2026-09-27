using System.ComponentModel.DataAnnotations;
using Airbnb.Modules.Services.Data;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Hybrid;

namespace Airbnb.Modules.Services;

internal static class GetService
{
    // public for the validation generator; still invisible outside the assembly because the class is internal.
    public sealed record Query([property: StringLength(50, MinimumLength = 1)] string Id);

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

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/services/{id}", async Task<Results<Ok<ApiResponse<ServiceDto>>, NotFound<ApiResponse<object>>>> (
            [AsParameters] Query query, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(query, cancellationToken) is { } service
                ? TypedResults.Ok(ApiResponse.Ok(service))
                : TypedResults.NotFound(ApiResponse.Fail($"Service '{query.Id}' was not found")));
}
