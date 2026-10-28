using Airbnb.Notifications.Data;
using Airbnb.Notifications.Email;
using Airbnb.Notifications.Handlers;

namespace Airbnb.Notifications.Reminders;

// Sends review reminders once they're due. The schedule is the pending_reminders table itself, written in the same
// transaction as the confirmation email, so no crash or redelivery can lose one; the claim in sent_emails keeps several
// instances (or a manual "Send due reminders now") from sending one twice.
public sealed class DueReminderSweep(IServiceScopeFactory scopes, IConfiguration configuration, ILogger<DueReminderSweep> logger)
    : BackgroundService
{
    private static readonly TimeSpan DefaultInterval = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(configuration.GetValue("Notifications:ReminderSweepInterval", DefaultInterval));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var services = scope.ServiceProvider;
                var time = services.GetRequiredService<TimeProvider>();
                await ReviewReminders.SendWaitingAsync(
                    services.GetRequiredService<NotificationsDbContext>(), services.GetRequiredService<SmtpEmailSender>(),
                    services.GetRequiredService<NotificationsSettings>(), time, dueBy: time.GetUtcNow(), stoppingToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // SMTP or the database down: the reminders stay waiting for the next tick.
                logger.LogWarning(exception, "Sending due review reminders failed; retrying on the next sweep");
            }
        }
    }
}
