using System.Security.Claims;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Identity;

internal static class Me
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapGet("/auth/me", (ClaimsPrincipal principal) => TypedResults.Ok(ApiResponse.Ok(new UserDto(
                principal.FindFirstValue(ClaimTypes.NameIdentifier)!,
                principal.FindFirstValue(ClaimTypes.Name)!,
                principal.FindFirstValue(ClaimTypes.Email)!))))
            .RequireAuthorization();
}
