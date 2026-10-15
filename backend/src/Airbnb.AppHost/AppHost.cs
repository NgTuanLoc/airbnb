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
    .WaitFor(db)
    .WaitFor(redis)
    .WaitFor(rabbitmq)
    .WaitForCompletion(migrations)
    .WithEnvironment("Bookings__QuoteKey", quoteKey)
    .WithEnvironment("Identity__External__Sso__acme__Name", "Acme Corp")
    .WithEnvironment("Identity__External__Sso__acme__Domains__0", "acme.test")
    .WithEnvironment("Identity__External__Sso__acme__Authority", ReferenceExpression.Create($"{keycloak.GetEndpoint("http")}/realms/acme"))
    .WithEnvironment("Identity__External__Sso__acme__ClientId", "airbnb")
    .WithEnvironment("Identity__External__Sso__acme__ClientSecret", acmeClientSecret)
    .WithEnvironment("Identity__External__Sso__acme__RequireHttpsMetadata", "false")
    .WithHttpHealthCheck("/health");

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

builder.Build().Run();

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
