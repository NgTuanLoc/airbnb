using System.Security.Cryptography;
using System.Text;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;

namespace Airbnb.Modules.Insights;

internal static partial class RebuildListingViews
{
    internal const string AdminKeyHeader = "X-Admin-Key";
    internal const string AdminKeyKey = "Insights:AdminKey";

    // Wipes the counts and replays the whole topic. For the Aspire dashboard's "Rebuild view stats" command, which sends
    // the generated admin key; without a configured key the endpoint doesn't exist.
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/insights/rebuild", IResult (
            IConfiguration configuration, ProjectionControl control, [FromHeader(Name = AdminKeyHeader)] string? key) =>
        {
            var expected = configuration[AdminKeyKey];
            if (string.IsNullOrEmpty(expected))
            {
                return TypedResults.NotFound(ApiResponse.Fail("Not Found"));
            }
            if (key is null || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(key)))
            {
                return TypedResults.Json(ApiResponse.Fail("Send the admin key"), statusCode: StatusCodes.Status401Unauthorized);
            }
            return control.RequestRebuild()
                ? TypedResults.Accepted((string?)null, new ApiResponse<object>(true))
                : TypedResults.Json(ApiResponse.Fail("The view projection isn't running"), statusCode: StatusCodes.Status503ServiceUnavailable);
        });
}
