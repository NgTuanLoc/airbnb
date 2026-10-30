using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Identity;

internal static partial class Register
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/auth/register", async Task<Results<Created<ApiResponse<AuthSessionDto>>, Conflict<ApiResponse<object>>>> (
            Command command, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(command, cancellationToken) is { } session
                ? TypedResults.Created((string?)null, ApiResponse.Ok(session))
                : TypedResults.Conflict(ApiResponse.Fail(DuplicateEmail)));
}
