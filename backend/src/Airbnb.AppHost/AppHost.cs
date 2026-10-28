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

// Host photo uploads: originals and processed photos in Blob Storage (Azurite locally), processed by an Azure Function.
var storage = builder.AddAzureStorage("storage")
    .RunAsEmulator(azurite => azurite.WithDataVolume().WithLifetime(ContainerLifetime.Persistent));
var blobs = storage.AddBlobs("blobs");

// Listing views (Insights module): the listing-views topic, browsable in Kafka UI. Persistent with a data volume, so the
// log outlives runs and "Rebuild view stats" has history to replay.
var kafka = builder.AddKafka("kafka")
    .WithKafkaUI(ui => ui.WithLifetime(ContainerLifetime.Persistent))
    .WithDataVolume()
    .WithLifetime(ContainerLifetime.Persistent);
var insightsAdminKey = builder.AddParameter("insights-admin-key",
    new GenerateParameterDefault { MinLength = 32, Special = false }, secret: true);

// Shared secret: only the Next server may send the API a host-listing quote.
var quoteKey = builder.AddParameter("bookings-quote-key",
    new GenerateParameterDefault { MinLength = 32, Special = false }, secret: true);

// Enterprise SSO demo (OAuth spec §3): Keycloak plays Acme Corp's identity provider for @acme.test emails
// (alex@acme.test / acme-demo). The realm file reads its client secret and redirect URI from the environment, so the
// secret is generated here rather than committed.
var acmeClientSecret = builder.AddParameter("sso-acme-client-secret",
    new GenerateParameterDefault { MinLength = 32, Special = false }, secret: true);
var keycloak = builder.AddKeycloak("keycloak")
    .WithLifetime(ContainerLifetime.Persistent)
    .WithRealmImport("./Realms")
    .WithEnvironment("ACME_CLIENT_SECRET", acmeClientSecret);

var migrations = builder.AddProject<Projects.Airbnb_MigrationService>("migrations")
    .WithReference(db)
    .WaitFor(db);

// The http profile only: an HTTPS endpoint would need a dev certificate, which CI runners don't have.
// The browser and the API both reach Keycloak at localhost:<port>, so the issuer the API checks is the one tokens carry.
var api = builder.AddProject<Projects.Airbnb_Api>("api", launchProfileName: "http")
    .WithReference(db)
    .WithReference(redis)
    .WithReference(rabbitmq)
    .WithReference(blobs)
    .WithReference(kafka)
    .WaitFor(db)
    .WaitFor(storage)
    .WaitFor(redis)
    .WaitFor(rabbitmq)
    .WaitFor(kafka)
    .WaitForCompletion(migrations)
    .WithEnvironment("Bookings__QuoteKey", quoteKey)
    .WithEnvironment("Insights__AdminKey", insightsAdminKey)
    .WithEnvironment("Identity__External__Sso__acme__Name", "Acme Corp")
    .WithEnvironment("Identity__External__Sso__acme__Domains__0", "acme.test")
    .WithEnvironment("Identity__External__Sso__acme__Authority", ReferenceExpression.Create($"{keycloak.GetEndpoint("http")}/realms/acme"))
    .WithEnvironment("Identity__External__Sso__acme__ClientId", "airbnb")
    .WithEnvironment("Identity__External__Sso__acme__ClientSecret", acmeClientSecret)
    .WithEnvironment("Identity__External__Sso__acme__RequireHttpsMetadata", "false")
    .WithHttpHealthCheck("/health")
    // Wipes the view counts and recounts them from the start of the listing-views topic.
    .WithHttpCommand("/api/insights/rebuild", "Rebuild view stats", endpointName: "http", commandOptions: new HttpCommandOptions
    {
        Method = HttpMethod.Post,
        Description = "Wipe the listing view counts and recount them from the start of the Kafka topic",
        ConfirmationMessage = "Wipe the view counts and replay every view from Kafka?",
        IconName = "ArrowSync",
        PrepareRequest = async context =>
            context.Request.Headers.Add("X-Admin-Key", await insightsAdminKey.Resource.GetValueAsync(context.CancellationToken)),
    });

// The k6 load test (perf/k6/load.js): starts only from the dashboard's Start button, never with `aspire run`.
// All its traffic comes from one container IP, so locally the read and view limits (per IP) are raised out of its way.
if (builder.ExecutionContext.IsRunMode)
{
    api.WithEnvironment("RateLimiting__ReadsPerMinute", "100000")
        .WithEnvironment("RateLimiting__ViewsPerMinute", "100000");
}
// Kept in user secrets (a plain generated parameter changes every run): the k6 user registered once must log in again.
var k6UserPassword = builder.AddResource(
    ParameterResourceBuilderExtensions.CreateDefaultPasswordParameter(builder, "k6-user-password", special: false));
// No vus/duration here: they would replace the script's two scenarios. Results are in the resource's console log;
// WithK6OtlpEnvironment is left out because k6 ignores the K6_OTEL_EXPORTER_OTLP_* names it sets.
builder.AddK6("k6")
    .WithBindMount("../../perf/k6", "/scripts", isReadOnly: true)
    .WithScript("/scripts/load.js")
    .WithEnvironment("API_URL", api.GetEndpoint("http"))
    .WithEnvironment("K6_USER_PASSWORD", k6UserPassword)
    .WaitFor(api)
    .WithExplicitStart();

// Blob-triggered on each original the API stores; needs the Azure Functions Core Tools (`func`) on the PATH.
builder.AddAzureFunctionsProject<Projects.Airbnb_Functions>("photo-processor")
    .WithHostStorage(storage)
    .WithReference(blobs)
    .WaitFor(storage);

// Real Google and GitHub sign-in once their credentials are in this project's user secrets (README).
AddSocialProvider("Google");
AddSocialProvider("GitHub");

// Port 3000 so Playwright (baseURL localhost:3000, reuseExistingServer) can run e2e against this frontend.
var frontend = builder.AddJavaScriptApp("frontend", "../../../frontend")
    .WithHttpEndpoint(port: 3000, env: "PORT")
    .WithReference(api)
    .WaitFor(api)
    .WithEnvironment("BOOKINGS_QUOTE_KEY", quoteKey)
    .WithEnvironment("DATA_SOURCE", builder.Configuration["Frontend:DataSource"] ?? "api");

// Identity providers send the browser back to the frontend's callback route, which hands the code to the API. Keycloak
// only accepts that exact URI, so it gets the frontend's port too (the testing builder randomizes ports) with the host
// the browser uses: from inside a container the frontend's own URL would be aspire.dev.internal.
api.WithEnvironment("Identity__External__RedirectBaseUrl", ReferenceExpression.Create($"{frontend.GetEndpoint("http")}/api/auth/callback"));
keycloak.WithEnvironment("ACME_REDIRECT_URI",
    ReferenceExpression.Create($"http://localhost:{frontend.GetEndpoint("http").Property(EndpointProperty.Port)}/api/auth/callback/sso-acme"));

await builder.Build().RunAsync();

// Passed to the API as secret parameters (masked in the dashboard), and only when both values are configured:
// an unset parameter would hold every `aspire run` at a prompt.
void AddSocialProvider(string provider)
{
    if (string.IsNullOrWhiteSpace(builder.Configuration[$"Identity:{provider}:ClientId"])
        || string.IsNullOrWhiteSpace(builder.Configuration[$"Identity:{provider}:ClientSecret"]))
    {
        return;
    }
    var name = provider.ToLowerInvariant();
    api.WithEnvironment($"Identity__External__{provider}__ClientId",
            builder.AddParameterFromConfiguration($"{name}-client-id", $"Identity:{provider}:ClientId"))
        .WithEnvironment($"Identity__External__{provider}__ClientSecret",
            builder.AddParameterFromConfiguration($"{name}-client-secret", $"Identity:{provider}:ClientSecret", secret: true));
}
