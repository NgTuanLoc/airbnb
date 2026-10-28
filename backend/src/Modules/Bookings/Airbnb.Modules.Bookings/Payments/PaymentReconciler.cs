using Airbnb.Modules.Bookings.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wolverine.EntityFrameworkCore;

namespace Airbnb.Modules.Bookings.Payments;

// Settles bookings left pending because the payment service didn't answer in time: asks it what happened, and gives up
// (declining, and voiding first so no charge can stand) when it never finds out. Single API instance assumed; every
// step is idempotent, so a second instance would only repeat work.
internal sealed class PaymentReconciler(
    IServiceScopeFactory scopes, PaymentsClient payments, TimeProvider time, IConfiguration configuration, ILogger<PaymentReconciler> logger)
    : BackgroundService
{
    internal static readonly TimeSpan MissingAfter = TimeSpan.FromMinutes(2);
    internal static readonly TimeSpan GiveUpAfter = TimeSpan.FromMinutes(15);
    private const int BatchSize = 100;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Bookings:Payments:ReconcilerEnabled", true))
        {
            return;
        }
        using var timer = new PeriodicTimer(configuration.GetValue("Bookings:Payments:ReconcileInterval", TimeSpan.FromSeconds(30)));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await ReconcileAsync(stoppingToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogError(exception, "Reconciling pending bookings failed; trying again next round");
            }
        }
    }

    private async Task ReconcileAsync(CancellationToken cancellationToken)
    {
        List<string> pending;
        await using (var scope = scopes.CreateAsyncScope())
        {
            pending = await scope.ServiceProvider.GetRequiredService<BookingsDbContext>().Bookings.AsNoTracking()
                .Where(b => b.Status == BookingStatus.Pending)
                .OrderBy(b => b.CreatedAt)
                .Select(b => b.Id)
                .Take(BatchSize)
                .ToListAsync(cancellationToken);
        }
        foreach (var id in pending)
        {
            await SettleAsync(id, cancellationToken);
        }
    }

    private async Task SettleAsync(string id, CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var outbox = scope.ServiceProvider.GetRequiredService<IDbContextOutbox<BookingsDbContext>>();
        var booking = await outbox.DbContext.Bookings.SingleOrDefaultAsync(b => b.Id == id && b.Status == BookingStatus.Pending, cancellationToken);
        if (booking is null)
        {
            return;
        }

        string? status;
        var answered = true;
        try
        {
            status = await payments.StatusAsync(id, cancellationToken);
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException && !cancellationToken.IsCancellationRequested)
        {
            (status, answered) = (null, false);
        }

        var age = time.GetUtcNow() - booking.CreatedAt;
        switch (status)
        {
            case "succeeded":
                await PaymentOutcomes.ConfirmAsync(outbox, booking, time, cancellationToken);
                break;
            case "declined" or "voided" or "refunded":
                await PaymentOutcomes.DeclineAsync(outbox, booking, cancellationToken);
                break;
            case null when answered && age >= MissingAfter:
                // The charge never reached the service, and every attempt has long finished.
                await PaymentOutcomes.DeclineAsync(outbox, booking, cancellationToken);
                break;
            case var _ when age >= GiveUpAfter:
                // Still processing, or the service won't say: void first, so a late success can't charge for nothing.
                if (await payments.VoidAsync(id, cancellationToken))
                {
                    await PaymentOutcomes.DeclineAsync(outbox, booking, cancellationToken);
                }
                break;
        }
    }
}
