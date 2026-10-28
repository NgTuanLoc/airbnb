using System.Text.Json;
using Airbnb.Payments.Api;
using Airbnb.Payments.Cards;
using Airbnb.Payments.Data;
using Microsoft.EntityFrameworkCore;
using Wolverine;
using Wolverine.ErrorHandling;
using Wolverine.Postgresql;
using Wolverine.RabbitMQ;

// The payment service (docs/superpowers/specs/2026-10-28-payment-service-design.md): the monolith charges, reads and
// voids payments over HTTP; cancellations arrive as events and are refunded. A fake processor decides by test card.
var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(new FakeProcessor(builder.Configuration.GetValue("Payments:SlowCardDelay", TimeSpan.FromSeconds(10))));

// Its own database. No retrying execution strategy: the charge's claim/update steps must each run once.
builder.AddNpgsqlDbContext<PaymentsDbContext>("paymentsdb", settings => settings.DisableRetry = true);

builder.UseWolverine(options =>
{
    options.UseSystemTextJsonForSerialization(json => json.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);
    options.PersistMessagesWithPostgresql(builder.Configuration.GetConnectionString("paymentsdb")!, "wolverine");

    // Its own queue on the monolith's "bookings" fanout exchange, for the refunds.
    options.UseRabbitMqUsingNamedConnection("messaging").AutoProvision();
    options.ListenToRabbitQueue("payments.bookings", queue => queue.BindExchange("bookings")).UseDurableInbox();
    options.CodeGeneration.AlwaysUseServiceLocationFor<PaymentsDbContext>();

    options.Policies.OnAnyException()
        .RetryWithCooldown(TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(10))
        .Then.ScheduleRetry(TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(30))
        .Then.MoveToErrorQueue();
});

var app = builder.Build();

await using (var scope = app.Services.CreateAsyncScope())
{
    await scope.ServiceProvider.GetRequiredService<PaymentsDbContext>().Database.MigrateAsync();
}

app.MapDefaultEndpoints();
app.MapPayments();

await app.RunAsync();
