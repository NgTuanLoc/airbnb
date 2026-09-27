using Airbnb.Api.Caching;
using Airbnb.Api.Errors;
using Airbnb.Api.RateLimiting;
using Airbnb.Modules.Experiences;
using Airbnb.Modules.Hosts;
using Airbnb.Modules.Reviews;
using Airbnb.Modules.Services;
using Airbnb.Modules.Stays;
using Microsoft.Extensions.Caching.Hybrid;
using Scalar.AspNetCore;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.Postgresql;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddSingleton(TimeProvider.System);
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
builder.AddHostsModule();
builder.AddExperiencesModule();
builder.AddServicesModule();
builder.AddReviewsModule();

// The one write flow (spec §3): a review and its ReviewSubmitted event commit in one Postgres transaction (outbox),
// and Wolverine relays the event afterwards. Its tables live in their own "wolverine" schema, created at startup.
builder.UseWolverine(options =>
{
    options.PersistMessagesWithPostgresql(builder.Configuration.GetConnectionString("airbnb")!, "wolverine");
    options.UseEntityFrameworkCoreTransactions();
});

var app = builder.Build();

// A malformed request (an unparsable JSON body, "?page=abc") is the client's fault: keep its 400 instead of the default 500.
app.UseExceptionHandler(new ExceptionHandlerOptions
{
    StatusCodeSelector = exception => exception is BadHttpRequestException badRequest
        ? badRequest.StatusCode
        : StatusCodes.Status500InternalServerError,
});
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
api.MapHostsEndpoints();
api.MapExperiencesEndpoints();
api.MapServicesEndpoints();
api.MapReviewsEndpoints();

app.Run();
