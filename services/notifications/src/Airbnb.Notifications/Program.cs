using System.Text.Json;
using Airbnb.Notifications.Data;
using Airbnb.Notifications.Email;
using Airbnb.Notifications.Handlers;
using Airbnb.Notifications.Reminders;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.ErrorHandling;
using Wolverine.Postgresql;
using Wolverine.RabbitMQ;

// The notification service (docs/superpowers/specs/2026-10-28-notification-service-design.md): booking events in from
// the broker, emails out through SMTP. It never calls the monolith; everything it needs travels in the events.
var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<SmtpEmailSender>();
builder.Services.AddHostedService<DueReminderSweep>();
builder.Services.AddSingleton(new NotificationsSettings(
    new Uri(builder.Configuration["Notifications:FrontendUrl"] ?? "http://localhost:3000")));

// Its own database. No retrying execution strategy: handlers open their own transactions.
builder.AddNpgsqlDbContext<NotificationsDbContext>("notificationsdb", settings => settings.DisableRetry = true);

builder.UseWolverine(options =>
{
    // camelCase JSON and the message identities are the whole contract with the monolith.
    options.UseSystemTextJsonForSerialization(json => json.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);
    options.PersistMessagesWithPostgresql(builder.Configuration.GetConnectionString("notificationsdb")!, "wolverine");

    // Its own queue, bound to the monolith's "bookings" fanout exchange: the monolith doesn't know this service exists.
    options.UseRabbitMqUsingNamedConnection("messaging").AutoProvision();
    options.ListenToRabbitQueue("notifications.bookings", queue => queue.BindExchange("bookings")).UseDurableInbox();
    // Aspire registers the DbContext through a factory (pooling), which Wolverine's generated code may only resolve
    // from the container when told so.
    options.CodeGeneration.AlwaysUseServiceLocationFor<NotificationsDbContext>();

    // Hiccups get quick retries; a longer SMTP or database outage gets retries scheduled minutes apart, so an email is
    // delayed rather than dropped. Each failed attempt rolls its claim back, so a retry never sends twice.
    options.Policies.OnAnyException()
        .RetryWithCooldown(TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(10))
        .Then.ScheduleRetry(TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(30))
        .Then.MoveToErrorQueue();
});

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
{
    await scope.ServiceProvider.GetRequiredService<NotificationsDbContext>().Database.MigrateAsync();
}

app.MapDefaultEndpoints();
app.MapSendDue();

await app.RunAsync();
