using System.Security.Claims;
using Airbnb.Modules.Bookings.Data;
using Airbnb.Modules.Bookings.Payments;
using Airbnb.SharedKernel;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Wolverine.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings;

internal static partial class CancelBooking
{
    // Only the guest cancels, and only before the check-in day; cancelling frees the nights for the exclusion constraint.
    // A pending booking's payment is voided first (so no late success can charge for it); a confirmed one's is refunded
    // by the payment service when it hears BookingCancelled.
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/bookings/{id}/cancel", async Task<Results<Ok<ApiResponse<BookingDto>>, NotFound<ApiResponse<object>>, Conflict<ApiResponse<object>>, JsonHttpResult<ApiResponse<object>>>> (
            string id, ClaimsPrincipal user, IServiceScopeFactory scopes, PaymentsClient payments, TimeProvider time, CancellationToken cancellationToken) =>
        {
            var guestId = user.FindFirstValue(ClaimTypes.NameIdentifier)!;
            for (var attempt = 1; attempt <= MaxAttempts; attempt++)
            {
                // A fresh scope per attempt: an outbox whose save lost the race still holds its unsent event.
                await using var scope = scopes.CreateAsyncScope();
                var outbox = scope.ServiceProvider.GetRequiredService<IDbContextOutbox<BookingsDbContext>>();
                if (await TryCancelAsync(outbox, id, guestId, payments, time, cancellationToken) is { } result)
                {
                    return result;
                }
            }
            return TypedResults.Conflict(ApiResponse.Fail("This booking just changed. Try again.", "booking_changed"));
        }).RequireAuthorization();
}
