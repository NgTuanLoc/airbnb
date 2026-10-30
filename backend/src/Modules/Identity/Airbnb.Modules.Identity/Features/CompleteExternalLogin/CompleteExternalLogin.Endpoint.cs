using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Logging;

namespace Airbnb.Modules.Identity.External;

internal static partial class CompleteExternalLogin
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/auth/external/callback", async Task<Results<Ok<ApiResponse<ResultDto>>, JsonHttpResult<ApiResponse<object>>>> (
            Command command, Handler handler, ILogger<Handler> logger, CancellationToken cancellationToken) =>
        {
            try
            {
                return TypedResults.Ok(ApiResponse.Ok(await handler.HandleAsync(command, cancellationToken)));
            }
            catch (ExternalLoginException exception)
            {
                LogFailed(logger, exception, exception.Error.Code);
                return exception.Error.ToResult();
            }
        });

    [LoggerMessage(Level = LogLevel.Information, Message = "An external sign-in failed: {Code}")]
    private static partial void LogFailed(ILogger logger, Exception exception, string code);
}
