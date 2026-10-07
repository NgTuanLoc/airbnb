using Airbnb.Api.Caching;
using Airbnb.Api.Errors;
using Airbnb.Api.RateLimiting;
using Airbnb.Modules.Experiences;
using Airbnb.Modules.Experiences.Contracts;
using Airbnb.Modules.Hosts;
using Airbnb.Modules.Identity;
using Airbnb.Modules.Reviews;
using Airbnb.Modules.Reviews.Contracts;
using Airbnb.Modules.Services;
using Airbnb.Modules.Stays;
using Airbnb.Modules.Stays.Contracts;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Caching.Hybrid;
using Npgsql;
using Scalar.AspNetCore;
using Wolverine;
using Wolverine.EntityFrameworkCore;
using Wolverine.ErrorHandling;
using Wolverine.Postgresql;
using Wolverine.RabbitMQ;

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
builder.AddIdentityModule();

// The one write flow (spec §3): a review and its ReviewSubmitted event commit in one Postgres transaction (outbox),
// then Wolverine relays the event to a durable RabbitMQ queue that this API also listens on (durable inbox).
// Its tables live in their own "wolverine" schema, and its exchange and queues are created at startup.
builder.UseWolverine(options =>
{
    const string reviewSubmittedQueue = "reviews.review-submitted";

    options.PersistMessagesWithPostgresql(builder.Configuration.GetConnectionString("airbnb")!, "wolverine");
    options.UseEntityFrameworkCoreTransactions();

    options.UseRabbitMqUsingNamedConnection("rabbitmq").AutoProvision();
    options.PublishMessage<ReviewSubmitted>().ToRabbitQueue(reviewSubmittedQueue).UseDurableOutbox();
    options.ListenToRabbitQueue(reviewSubmittedQueue).UseDurableInbox();

    // Each module's handler gets the message on its own, with its own retries: one failing never blocks or re-runs another.
    options.MultipleHandlerBehavior = MultipleHandlerBehavior.Separated;

    // Separated fans each message out to one local queue per handler; durable so a crash can't drop a rating update.
    options.Policies.UseDurableLocalQueues();

    // The handlers in Messaging/ reach each module through its Contracts interface; the implementations are internal,
    // so Wolverine's generated code has to resolve them from the container.
    options.CodeGeneration.AlwaysUseServiceLocationFor<IListingReviewStats>();
    options.CodeGeneration.AlwaysUseServiceLocationFor<IExperienceReviewStats>();

    // Transient database errors: three retries with cooldowns, then the error queue (spec §3).
    options.OnException<NpgsqlException>(exception => exception.IsTransient)
        .RetryWithCooldown(TimeSpan.FromMilliseconds(100), TimeSpan.FromMilliseconds(500), TimeSpan.FromSeconds(2))
        .Then.MoveToErrorQueue();
});

// The browser's IP arrives as X-Forwarded-For from the Next.js server; the defaults trust only loopback proxies,
// which is where Aspire runs Next. Behind other proxies, add them to KnownProxies/KnownNetworks.
builder.Services.Configure<ForwardedHeadersOptions>(options => options.ForwardedHeaders = ForwardedHeaders.XForwardedFor);

var app = builder.Build();

app.UseForwardedHeaders();

// A malformed request (an unparsable JSON body, "?page=abc") is the client's fault: keep its 400 instead of the default 500.
app.UseExceptionHandler(new ExceptionHandlerOptions
{
    StatusCodeSelector = exception => exception is BadHttpRequestException badRequest
        ? badRequest.StatusCode
        : StatusCodes.Status500InternalServerError,
});
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();
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
api.MapIdentityEndpoints();

app.Run();
