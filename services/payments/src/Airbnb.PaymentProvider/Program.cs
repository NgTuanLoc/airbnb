using Airbnb.PaymentProvider;
using Scalar.AspNetCore;

// The fake payment provider (docs/superpowers/specs/2026-11-05-payment-webhooks-design.md): a stand-in for an outside
// processor like Stripe. It charges by Stripe-style test card numbers, answers at once, and reports every change of a
// charge to the payment service by signed webhook. In memory only.
var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddOpenApi();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(ProviderSettings.From(builder.Configuration));
// ServiceDefaults' resilience handler doesn't retry POSTs; Webhooks retries deliveries on its own schedule.
builder.Services.AddHttpClient(Webhooks.ClientName);
builder.Services.AddSingleton<Webhooks>();
builder.Services.AddSingleton<Charges>();

var app = builder.Build();

app.MapDefaultEndpoints();

// The API reference: /scalar (the dashboard links there), over /openapi/v1.json.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.MapProvider();

await app.RunAsync();
