using System.Security.Claims;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Logging;

namespace Airbnb.Modules.Identity.External;

internal static partial class StartExternalLogin
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/auth/external/start", async Task<Results<Ok<ApiResponse<StartDto>>, JsonHttpResult<ApiResponse<object>>>> (
            Command command, ClaimsPrincipal principal, Handler handler, ILogger<Handler> logger, CancellationToken cancellationToken) =>
        {
            if (command.Link && principal.Identity?.IsAuthenticated != true)
            {
                return TypedResults.Json(ApiResponse.Fail(SessionAuthentication.LogInMessage), statusCode: StatusCodes.Status401Unauthorized);
            }
            try
            {
                return TypedResults.Ok(ApiResponse.Ok(await handler.HandleAsync(command, command.Link ? principal : null, cancellationToken)));
            }
            catch (ExternalLoginException exception)
            {
                logger.LogInformation(exception, "Starting an external sign-in failed: {Code}", exception.Error.Code);
                return exception.Error.ToResult();
            }
        });
}
