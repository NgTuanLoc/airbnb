using Airbnb.Api.Caching;
using Airbnb.Api.Errors;
using Airbnb.Api.RateLimiting;
using Airbnb.Modules.Stays;
using Microsoft.Extensions.Caching.Hybrid;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDataSource("airbnb");

// HybridCache: 1-minute in-memory layer over a 10-minute Redis layer guarded by Polly (spec §2, §4).
builder.AddRedisDistributedCache("redis");
builder.Services.AddResilientDistributedCache();
builder.Services.AddHybridCache(options => options.DefaultEntryOptions = new HybridCacheEntryOptions
{
    Expiration = TimeSpan.FromMinutes(10),
    LocalCacheExpiration = TimeSpan.FromMinutes(1),
});

// Registered before AddProblemDetails so it is chosen ahead of the default ProblemDetails JSON writer.
builder.Services.AddSingleton<IProblemDetailsWriter, EnvelopeProblemDetailsWriter>();
builder.Services.AddProblemDetails();
builder.Services.AddApiRateLimiting(builder.Configuration);
builder.Services.AddOpenApi();

builder.AddStaysModule();

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseRateLimiter();

app.MapDefaultEndpoints();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

var api = app.MapGroup("/api");
api.MapStaysEndpoints();

app.Run();
