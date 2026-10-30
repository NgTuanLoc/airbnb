using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Identity;

internal static partial class Login
{
    internal const string TooManyAttempts = "Too many failed attempts. Try again in a few minutes.";

    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/auth/login", async Task<Results<Ok<ApiResponse<AuthSessionDto>>, JsonHttpResult<ApiResponse<object>>>> (
            Command command, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(command, cancellationToken) switch
            {
                (_, true) => TypedResults.Json(ApiResponse.Fail(TooManyAttempts), statusCode: StatusCodes.Status429TooManyRequests),
                ({ } session, _) => TypedResults.Ok(ApiResponse.Ok(session)),
                _ => TypedResults.Json(ApiResponse.Fail(InvalidCredentials), statusCode: StatusCodes.Status401Unauthorized),
            });
}
