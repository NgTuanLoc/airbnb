using Airbnb.Api.Errors;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Airbnb.UnitTests.Api;

public sealed class EnvelopeProblemDetailsWriterTests
{
    [Fact]
    public async Task Validation_problem_lists_every_field_in_order()
    {
        var problem = new HttpValidationProblemDetails(new Dictionary<string, string[]>
        {
            ["Limit"] = ["The field Limit must be between 1 and 100."],
            ["Location"] = ["Too long.", "Contains control characters."],
        });

        var body = await WriteAsync(problem, StatusCodes.Status400BadRequest);

        Assert.Equal(
            """{"success":false,"error":"Limit: The field Limit must be between 1 and 100.; Location: Too long. Contains control characters."}""",
            body);
    }

    [Theory]
    [InlineData(StatusCodes.Status500InternalServerError)]
    [InlineData(StatusCodes.Status503ServiceUnavailable)]
    public async Task Server_errors_never_expose_details(int status)
    {
        var problem = new ProblemDetails
        {
            Status = status,
            Title = "Boom",
            Detail = "NpgsqlException: password authentication failed for user admin",
        };

        var body = await WriteAsync(problem, status);

        Assert.Equal("""{"success":false,"error":"An unexpected error occurred."}""", body);
    }

    [Fact]
    public async Task Client_error_prefers_detail()
    {
        var problem = new ProblemDetails { Status = 404, Title = "Not Found", Detail = "Listing l99 was not found" };

        var body = await WriteAsync(problem, StatusCodes.Status404NotFound);

        Assert.Equal("""{"success":false,"error":"Listing l99 was not found"}""", body);
    }

    [Fact]
    public async Task Client_error_falls_back_to_title()
    {
        var body = await WriteAsync(new ProblemDetails { Status = 404, Title = "Not Found" }, StatusCodes.Status404NotFound);

        Assert.Equal("""{"success":false,"error":"Not Found"}""", body);
    }

    [Fact]
    public async Task Client_error_without_title_uses_the_response_reason_phrase()
    {
        var body = await WriteAsync(new ProblemDetails(), StatusCodes.Status429TooManyRequests);

        Assert.Equal("""{"success":false,"error":"Too Many Requests"}""", body);
    }

    [Fact]
    public void Writes_whatever_the_client_accepts()
    {
        var http = new DefaultHttpContext();
        http.Request.Headers.Accept = "text/html";

        Assert.True(new EnvelopeProblemDetailsWriter().CanWrite(new ProblemDetailsContext { HttpContext = http }));
    }

    private static async Task<string> WriteAsync(ProblemDetails problem, int responseStatus)
    {
        var http = new DefaultHttpContext();
        http.Response.StatusCode = responseStatus;
        http.Response.Body = new MemoryStream();

        await new EnvelopeProblemDetailsWriter().WriteAsync(new ProblemDetailsContext { HttpContext = http, ProblemDetails = problem });

        http.Response.Body.Position = 0;
        using var reader = new StreamReader(http.Response.Body);
        return await reader.ReadToEndAsync(TestContext.Current.CancellationToken);
    }
}
