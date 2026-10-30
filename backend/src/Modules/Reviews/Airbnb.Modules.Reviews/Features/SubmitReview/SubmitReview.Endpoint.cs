using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;

namespace Airbnb.Modules.Reviews;

internal static partial class SubmitReview
{
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/reviews", async Task<Results<Created<ApiResponse<ReviewDto>>, NotFound<ApiResponse<object>>>> (
            Command command, Handler handler, CancellationToken cancellationToken) =>
            await handler.HandleAsync(command, cancellationToken) is { } review
                ? TypedResults.Created((string?)null, ApiResponse.Ok(review))
                : TypedResults.NotFound(ApiResponse.Fail(SubjectNotFound(command))));

    private static string SubjectNotFound(Command command) =>
        $"{(command.SubjectType == "stay" ? "Listing" : "Experience")} '{command.SubjectId}' was not found";
}
