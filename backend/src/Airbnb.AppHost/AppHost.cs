using Aspire.Hosting.Yarp.Transforms;

var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres")
    .WithDataVolume()
    .WithLifetime(ContainerLifetime.Persistent)
    .WithPgWeb();
var db = postgres.AddDatabase("airbnb");

var redis = builder.AddRedis("redis")
    .WithLifetime(ContainerLifetime.Persistent);

// Wolverine's AMQP broker (review events). Both speak AMQP 0-9-1 and appear as the "messaging" connection, so the API
// never knows which one it got: LavinMQ by default, RabbitMQ with Messaging:Broker = RabbitMQ (appsettings.json).
// LavinMQ's integration takes fixed host ports: 5672 (AMQP) and 15672 (its management UI).
var broker = builder.Configuration["Messaging:Broker"] ?? "LavinMQ";
IResourceBuilder<IResourceWithConnectionString> messaging = broker.ToLowerInvariant() switch
{
    "lavinmq" => builder.AddLavinMQ("messaging")
        .WithLifetime(ContainerLifetime.Persistent),
    "rabbitmq" => builder.AddRabbitMQ("messaging")
        .WithManagementPlugin()
        .WithLifetime(ContainerLifetime.Persistent),
    _ => throw new InvalidOperationException($"Messaging:Broker must be LavinMQ or RabbitMQ, not '{broker}'"),
};

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

// The notification service (services/notifications): a separate microservice with its own database on the same Postgres
// server. It hears about bookings only through the broker and emails guests through Mailpit, a fake inbox with a web UI.
var mailpit = builder.AddMailPit("mailpit")
    .WithLifetime(ContainerLifetime.Persistent);
var notificationsDb = postgres.AddDatabase("notificationsdb", "notifications");
var notificationsAdminKey = builder.AddParameter("notifications-admin-key",
    new GenerateParameterDefault { MinLength = 32, Special = false }, secret: true);

// The payment service (services/payments): the monolith charges, reads and voids payments over HTTP with a shared
// service key, and the service refunds cancelled bookings it hears about on the broker. Its own database, same server.
var paymentsDb = postgres.AddDatabase("paymentsdb", "payments");
var paymentsServiceKey = builder.AddParameter("payments-service-key",
    new GenerateParameterDefault { MinLength = 32, Special = false }, secret: true);
var payments = builder.AddProject<Projects.Airbnb_Payments>("payments", launchProfileName: "http")
    .WithReference(paymentsDb)
    .WithReference(messaging)
    .WaitFor(paymentsDb)
    .WaitFor(messaging)
    .WithEnvironment("Payments__ServiceKey", paymentsServiceKey)
    .WithHttpHealthCheck("/health");

// The chat service (services/chat): guests message hosts live over SignalR. Its own kind of storage (MongoDB, browsable
// in Mongo Express), two instances that reach each other's connections through the Redis backplane, and the only
// service the browser talks to directly: through the gateway, with a token the API signs (chat-token-key). The Next
// server starts conversations with chat-service-key. GLIBC_TUNABLES: MongoDB 8's tcmalloc breaks on Linux 6.19+'s rseq
// changes (SERVER-121912) and the image hands rseq to tcmalloc (rseq=0); rseq=1 keeps it in glibc, so tcmalloc runs
// without it.
var mongo = builder.AddMongoDB("mongo")
    .WithEnvironment("GLIBC_TUNABLES", "glibc.pthread.rseq=1")
    .WithDataVolume()
    .WithLifetime(ContainerLifetime.Persistent)
    .WithMongoExpress(express => express.WithLifetime(ContainerLifetime.Persistent));
var chatDb = mongo.AddDatabase("chatdb", "chat");
var chatServiceKey = builder.AddParameter("chat-service-key",
    new GenerateParameterDefault { MinLength = 32, Special = false }, secret: true);
var chatTokenKey = builder.AddParameter("chat-token-key",
    new GenerateParameterDefault { MinLength = 32, Special = false }, secret: true);
var chat = builder.AddProject<Projects.Airbnb_Chat>("chat", launchProfileName: "http")
    .WithReference(chatDb)
    .WithReference(redis)
    .WaitFor(chatDb)
    .WaitFor(redis)
    .WithEnvironment("Chat__ServiceKey", chatServiceKey)
    .WithEnvironment("Chat__TokenKey", chatTokenKey)
    .WithReplicas(2)
    .WithHttpHealthCheck("/health");

// The API gateway: one address for the services the browser reaches, routed by path (WebSockets included). Only chat
// so far; the Next server keeps calling the API directly, since the API trusts only loopback proxies for client IPs.
// Its Information logs carry full request URLs, and a browser's hub URL carries its chat token (WebSockets take no
// headers), so YARP and ASP.NET Core log at Warning: nothing of the token reaches the console or the dashboard.
var gateway = builder.AddYarp("gateway")
    .WithConfiguration(yarp => yarp.AddRoute("/chat/{**catch-all}", chat).WithTransformPathRemovePrefix("/chat"))
    .WithEnvironment("Logging__LogLevel__Yarp", "Warning")
    .WithEnvironment("Logging__LogLevel__Microsoft.AspNetCore", "Warning");

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
    .WithReference(messaging)
    .WithReference(blobs)
    .WithReference(kafka)
    .WaitFor(db)
    .WaitFor(storage)
    .WaitFor(redis)
    .WaitFor(messaging)
    .WaitFor(kafka)
    .WithReference(payments)
    .WaitFor(payments)
    .WaitForCompletion(migrations)
    .WithEnvironment("Payments__ServiceKey", paymentsServiceKey)
    .WithEnvironment("Identity__ChatToken__SigningKey", chatTokenKey)
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
    // Chat: Next starts conversations straight on the service, and tells the browser to reach the hub via the gateway.
    .WithEnvironment("CHAT_HTTP", chat.GetEndpoint("http"))
    .WithEnvironment("CHAT_SERVICE_KEY", chatServiceKey)
    .WithEnvironment("CHAT_HUB_URL", ReferenceExpression.Create($"{gateway.GetEndpoint("http")}/chat/hub"))
    .WithEnvironment("DATA_SOURCE", builder.Configuration["Frontend:DataSource"] ?? "api");

// The smart chat box's assistant (services/assistant): a local model on Ollama, through Aspire's Ollama integration.
// The model downloads once into the data volume (about 2 GB for the default); Assistant:Model swaps it, and
// Assistant:Gpu=true uses an NVIDIA GPU (it fails to start without one). Its tools read the catalog through the
// frontend's public API, where seed and host listings both live. Open WebUI chats with the same models in the browser.
var ollama = builder.AddOllama("ollama")
    .WithOpenWebUI(ui => ui.WithLifetime(ContainerLifetime.Persistent))
    .WithDataVolume()
    .WithLifetime(ContainerLifetime.Persistent);
if (bool.TryParse(builder.Configuration["Assistant:Gpu"], out var useGpu) && useGpu)
{
    ollama.WithGPUSupport();
}
var assistantModel = ollama.AddModel("assistant-model", builder.Configuration["Assistant:Model"] ?? "qwen2.5:3b");
var assistant = builder.AddProject<Projects.Airbnb_Assistant>("assistant", launchProfileName: "http")
    .WithReference(assistantModel)
    .WaitFor(assistantModel)
    .WithEnvironment("Assistant__CatalogUrl", frontend.GetEndpoint("http"))
    .WithHttpHealthCheck("/health");
frontend.WithEnvironment("ASSISTANT_HTTP", assistant.GetEndpoint("http"));

// Identity providers send the browser back to the frontend's callback route, which hands the code to the API. Keycloak
// only accepts that exact URI, so it gets the frontend's port too (the testing builder randomizes ports) with the host
// the browser uses: from inside a container the frontend's own URL would be aspire.dev.internal.
api.WithEnvironment("Identity__External__RedirectBaseUrl", ReferenceExpression.Create($"{frontend.GetEndpoint("http")}/api/auth/callback"));

// Emails link to the frontend; "Send due reminders now" sends every waiting review reminder without waiting for check-out.
builder.AddProject<Projects.Airbnb_Notifications>("notifications", launchProfileName: "http")
    .WithReference(notificationsDb)
    .WithReference(messaging)
    .WithReference(mailpit)
    .WaitFor(notificationsDb)
    .WaitFor(messaging)
    .WaitFor(mailpit)
    .WithEnvironment("Notifications__FrontendUrl", frontend.GetEndpoint("http"))
    .WithEnvironment("Notifications__AdminKey", notificationsAdminKey)
    .WithHttpHealthCheck("/health")
    .WithHttpCommand("/reminders/send-due", "Send due reminders now", endpointName: "http", commandOptions: new HttpCommandOptions
    {
        Method = HttpMethod.Post,
        Description = "Email every guest whose review reminder is still waiting, whatever their check-out date",
        IconName = "Mail",
        PrepareRequest = async context =>
            context.Request.Headers.Add("X-Admin-Key", await notificationsAdminKey.Resource.GetValueAsync(context.CancellationToken)),
    });
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
