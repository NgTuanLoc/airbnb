using System.Text.Json;
using Airbnb.Payments.Api;
using Airbnb.Payments.Contracts;
using Airbnb.Payments.Data;
using Airbnb.Payments.Provider;
using Airbnb.Payments.Webhooks;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.ErrorHandling;
using Wolverine.Postgresql;
using Wolverine.RabbitMQ;

// The payment service (docs/superpowers/specs/2026-10-28-payment-service-design.md, and
// 2026-11-05-payment-webhooks-design.md): the monolith charges, reads and voids payments over HTTP; cancellations
// arrive as events and are refunded. The charges themselves go to the payment provider, which reports outcomes by
// webhook; each outcome is announced on the "payments" exchange.
var builder = WebApplication.CreateBuilder(args);

// Bad settings fail at startup: without them nothing can be charged, or no webhook trusted.
foreach (var required in new[] { "Payments:ProviderKey", "Payments:WebhookSecret" })
{
    if (string.IsNullOrEmpty(builder.Configuration[required]))
    {
        throw new InvalidOperationException($"{required} is required");
    }
}

builder.AddServiceDefaults();
builder.Services.AddOpenApi();
builder.Services.AddSingleton(TimeProvider.System);
// An Aspire service-discovery name: https when the provider offers it, else http.
builder.Services.AddHttpClient(ProviderClient.Name, client => client.BaseAddress = new Uri(ProviderClient.BaseUrl));
builder.Services.AddSingleton<ProviderClient>();

// Its own database. No retrying execution strategy: the charge's claim/update steps must each run once.
builder.AddNpgsqlDbContext<PaymentsDbContext>("paymentsdb", settings => settings.DisableRetry = true);

builder.UseWolverine(options =>
{
    const string PaymentsExchange = "payments";

    options.UseSystemTextJsonForSerialization(json => json.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);
    options.PersistMessagesWithPostgresql(builder.Configuration.GetConnectionString("paymentsdb")!, "wolverine");
    // A payment's status change and its event commit together (IDbContextOutbox).
    options.UseEntityFrameworkCoreTransactions();

    // Its own queue on the monolith's "bookings" fanout exchange, for the refunds.
    options.UseRabbitMqUsingNamedConnection("messaging").AutoProvision();
    options.ListenToRabbitQueue("payments.bookings", queue => queue.BindExchange("bookings")).UseDurableInbox();
    // Outcomes go to the "payments" fanout exchange for whoever listens (the monolith's Bookings).
    options.PublishMessage<PaymentSucceeded>().ToRabbitExchange(PaymentsExchange, exchange => exchange.ExchangeType = ExchangeType.Fanout).UseDurableOutbox();
    options.PublishMessage<PaymentDeclined>().ToRabbitExchange(PaymentsExchange, exchange => exchange.ExchangeType = ExchangeType.Fanout).UseDurableOutbox();
    options.CodeGeneration.AlwaysUseServiceLocationFor<PaymentsDbContext>();
    // A void's RefundPayment commits with the void, and survives a restart until the provider has refunded.
    options.Policies.UseDurableLocalQueues();

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

// The API reference: /scalar (the dashboard links there), over /openapi/v1.json.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.MapPayments();
app.MapProviderWebhooks();

await app.RunAsync();
