var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres")
    .WithDataVolume()
    .WithLifetime(ContainerLifetime.Persistent)
    .WithPgWeb();
var db = postgres.AddDatabase("airbnb");

var redis = builder.AddRedis("redis")
    .WithLifetime(ContainerLifetime.Persistent);

var rabbitmq = builder.AddRabbitMQ("rabbitmq")
    .WithManagementPlugin()
    .WithLifetime(ContainerLifetime.Persistent);

// Shared secret: only the Next server may send the API a host-listing quote.
var quoteKey = builder.AddParameter("bookings-quote-key",
    new GenerateParameterDefault { MinLength = 32, Special = false }, secret: true);

var migrations = builder.AddProject<Projects.Airbnb_MigrationService>("migrations")
    .WithReference(db)
    .WaitFor(db);

// The http profile only: an HTTPS endpoint would need a dev certificate, which CI runners don't have.
var api = builder.AddProject<Projects.Airbnb_Api>("api", launchProfileName: "http")
    .WithReference(db)
    .WithReference(redis)
    .WithReference(rabbitmq)
    .WaitFor(db)
    .WaitFor(redis)
    .WaitFor(rabbitmq)
    .WaitForCompletion(migrations)
    .WithEnvironment("Bookings__QuoteKey", quoteKey)
    .WithHttpHealthCheck("/health");

// Port 3000 so Playwright (baseURL localhost:3000, reuseExistingServer) can run e2e against this frontend.
builder.AddJavaScriptApp("frontend", "../../../frontend")
    .WithHttpEndpoint(port: 3000, env: "PORT")
    .WithReference(api)
    .WaitFor(api)
    .WithEnvironment("BOOKINGS_QUOTE_KEY", quoteKey)
    .WithEnvironment("DATA_SOURCE", builder.Configuration["Frontend:DataSource"] ?? "api");

builder.Build().Run();
