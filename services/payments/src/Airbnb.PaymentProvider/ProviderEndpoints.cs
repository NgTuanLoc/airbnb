using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;

namespace Airbnb.PaymentProvider;

public sealed record ChargeRequest(string? Reference, decimal Amount, string? Currency, CardDetails? Card);

public sealed record CardDetails(string? Number, int ExpMonth, int ExpYear, string? Cvc);

public sealed record DisputeRequest(string? Reference);

public sealed record ErrorBody(string Code, string Error);

public static class ProviderEndpoints
{
    private const int MaxReferenceLength = 40;
    private const decimal MaxAmount = 1_000_000m;

    public static void MapProvider(this IEndpointRouteBuilder app)
    {
        // Only the payment service calls the API, with its key on every request; the dashboard's commands use it too.
        var api = app.MapGroup("").AddEndpointFilter(RequireApiKey);

        api.MapPost("/charges", (ChargeRequest request, Charges charges) =>
            IsValid(request) ? Answer(charges.Create(request.Reference!, request.Amount, request.Currency!, request.Card!.Number!)) : Invalid());
        api.MapGet("/charges/{reference}", (string reference, Charges charges) =>
            charges.Find(reference) is { } charge ? Results.Ok(charge) : Answer(new ChargeResult(null, Refusal.NotFound)));
        api.MapPost("/charges/{reference}/refund", (string reference, Charges charges) => Answer(charges.Refund(reference)));

        // Plays the guest's bank contesting a charge (a dashboard command).
        api.MapPost("/disputes", (DisputeRequest request, Charges charges) =>
            string.IsNullOrWhiteSpace(request.Reference) ? Invalid() : Answer(charges.Dispute(request.Reference)));

        api.MapPost("/events/resend-latest", (Webhooks webhooks) => webhooks.ResendLatest() is { } latest
            ? Results.Ok(new { latest.Id, latest.Type })
            : Results.NotFound(new ErrorBody("not_found", "No event has been sent yet")));
    }

    private static bool IsValid(ChargeRequest request) =>
        request.Reference is { Length: > 0 and <= MaxReferenceLength }
        && request.Amount is > 0 and <= MaxAmount
        && request.Currency is { Length: 3 }
        && !string.IsNullOrWhiteSpace(request.Card?.Number);

    private static IResult Invalid() =>
        Results.BadRequest(new ErrorBody("invalid_request", "A reference, an amount, a currency and a card are required"));

    private static IResult Answer(ChargeResult result) => result.Refusal switch
    {
        null => Results.Ok(result.Charge),
        Refusal.NotFound => Results.NotFound(new ErrorBody("not_found", "No charge has that reference")),
        Refusal.IdempotencyConflict => Results.Conflict(new ErrorBody("idempotency_conflict", "That reference was charged a different amount")),
        Refusal.ProcessingError => Results.Json(new ErrorBody("processing_error", "The charge failed before it was made; try again"),
            statusCode: StatusCodes.Status500InternalServerError),
        Refusal.StillProcessing => Results.Conflict(new ErrorBody("charge_processing", "The charge is still processing; try again once it settles")),
        Refusal.NotDisputable => Results.Conflict(new ErrorBody("not_disputable", "Only a succeeded charge can be disputed")),
        _ => throw new UnreachableException(),
    };

    private static async ValueTask<object?> RequireApiKey(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var expected = context.HttpContext.RequestServices.GetRequiredService<ProviderSettings>().ApiKey;
        var presented = context.HttpContext.Request.Headers["X-Api-Key"].ToString();
        if (string.IsNullOrEmpty(presented)
            || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(presented)))
        {
            return Results.Unauthorized();
        }
        return await next(context);
    }
}
