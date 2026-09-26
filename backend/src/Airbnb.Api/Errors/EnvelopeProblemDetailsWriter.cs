using Airbnb.SharedKernel;
using Microsoft.AspNetCore.WebUtilities;

namespace Airbnb.Api.Errors;

// Every ProblemDetails the framework produces — built-in validation, unhandled exceptions,
// status-code pages, rate-limiter rejections — leaves the API as the frontend envelope.
internal sealed class EnvelopeProblemDetailsWriter : IProblemDetailsWriter
{
    public const string ServerErrorMessage = "An unexpected error occurred.";

    // JSON whatever the Accept header says: the API has exactly one error format.
    public bool CanWrite(ProblemDetailsContext context) => true;

    public ValueTask WriteAsync(ProblemDetailsContext context)
    {
        var response = context.HttpContext.Response;
        var status = context.ProblemDetails.Status ?? response.StatusCode;
        var message = context.ProblemDetails switch
        {
            HttpValidationProblemDetails { Errors.Count: > 0 } validation => string.Join("; ",
                validation.Errors.Select(field => $"{field.Key}: {string.Join(" ", field.Value)}")),
            _ when status >= StatusCodes.Status500InternalServerError => ServerErrorMessage,
            var problem => problem.Detail ?? problem.Title ?? ReasonPhrases.GetReasonPhrase(status),
        };

        return new ValueTask(response.WriteAsJsonAsync(ApiResponse.Fail(message)));
    }
}
