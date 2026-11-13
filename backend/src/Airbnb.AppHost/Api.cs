using Aspire.Hosting.Azure;

namespace Airbnb.AppHost;

// The modular monolith (src/Airbnb.Api) and what runs beside it: its migrations, the Acme SSO identity provider and
// the photo processor.
internal static class ApiExtensions
{
    // Applies every module's migrations and seeds empty tables, then exits. In the cluster it runs as a Job.
    public static IResourceBuilder<ProjectResource> AddMigrations(this IDistributedApplicationBuilder builder, Infrastructure infra) =>
        builder.AddProject<Projects.Airbnb_MigrationService>("migrations")
            .WithReference(infra.Db)
            .WaitFor(infra.Db)
            .RunsOnceOnLocalCluster();

    // The http profile only: an HTTPS endpoint would need a dev certificate, which CI runners don't have.
    public static IResourceBuilder<ProjectResource> AddApi(this IDistributedApplicationBuilder builder, Infrastructure infra, Keys keys,
        IResourceBuilder<ProjectResource> migrations, IResourceBuilder<ProjectResource> payments)
    {
        var api = builder.AddProject<Projects.Airbnb_Api>("api", launchProfileName: "http")
            .WithReference(infra.Db).WaitFor(infra.Db)
            .WithReference(infra.Redis).WaitFor(infra.Redis)
            .WithReference(infra.Messaging).WaitFor(infra.Messaging)
            .WithReference(infra.Storage.Blobs).WaitFor(infra.Storage.Server)
            .WithReference(infra.Kafka).WaitFor(infra.Kafka)
            .WithReference(payments).WaitFor(payments)
            .WaitForCompletion(migrations)
            .WithEnvironment("Payments__ServiceKey", keys.PaymentsService)
            .WithEnvironment("Identity__ChatToken__SigningKey", keys.ChatToken)
            .WithEnvironment("Bookings__QuoteKey", keys.BookingsQuote)
            .WithEnvironment("Insights__AdminKey", keys.InsightsAdmin)
            .AsHttpApi()
            // Wipes the view counts and recounts them from the start of the listing-views topic.
            .WithAdminCommand("/api/insights/rebuild", "Rebuild view stats", keys.InsightsAdmin, new HttpCommandOptions
            {
                Description = "Wipe the listing view counts and recount them from the start of the Kafka topic",
                ConfirmationMessage = "Wipe the view counts and replay every view from Kafka?",
                IconName = "ArrowSync",
            });

        // The k6 load test's traffic comes from one container IP, so under `aspire run` the per-IP read and view
        // limits are raised out of its way.
        if (builder.ExecutionContext.IsRunMode)
        {
            api.WithEnvironment("RateLimiting__ReadsPerMinute", "100000")
                .WithEnvironment("RateLimiting__ViewsPerMinute", "100000");
        }

        // Real Google and GitHub sign-in once their credentials are in this project's user secrets (README).
        api.WithSocialProvider("Google").WithSocialProvider("GitHub");
        return api;
    }

    // Enterprise SSO demo (OAuth spec §3): Keycloak plays Acme Corp's identity provider for @acme.test emails
    // (alex@acme.test / acme-demo). The realm file reads its client secret and redirect URI from the environment, so
    // the secret is generated rather than committed. The API trusts it as the "acme" connection.
    public static IResourceBuilder<KeycloakResource> AddAcmeSso(this IDistributedApplicationBuilder builder, Keys keys,
        IResourceBuilder<ProjectResource> api, BrowserUrls urls)
    {
        var keycloak = builder.AddKeycloak("keycloak")
            .WithLifetime(ContainerLifetime.Persistent)
            .WithEnvironment("ACME_CLIENT_SECRET", keys.AcmeClientSecret)
            .WithEnvironment("ACME_REDIRECT_URI", ReferenceExpression.Create($"{urls.Frontend}/api/auth/callback/sso-acme"))
            .WithAcmeRealm();
        ReferenceExpression keycloakUrl = builder.IsLocalCluster()
            ? ReferenceExpression.Create($"{LocalCluster.KeycloakUrl}")
            : ReferenceExpression.Create($"{keycloak.GetEndpoint("http")}");

        // The browser and the API reach Keycloak at the same URL, so the issuer the API checks is the one tokens carry.
        api.WithEnvironment("Identity__External__Sso__acme__Name", "Acme Corp")
            .WithEnvironment("Identity__External__Sso__acme__Domains__0", "acme.test")
            .WithEnvironment("Identity__External__Sso__acme__Authority", ReferenceExpression.Create($"{keycloakUrl}/realms/acme"))
            .WithEnvironment("Identity__External__Sso__acme__ClientId", "airbnb")
            .WithEnvironment("Identity__External__Sso__acme__ClientSecret", keys.AcmeClientSecret)
            .WithEnvironment("Identity__External__Sso__acme__RequireHttpsMetadata", "false")
            .ReachesKeycloak();
        return keycloak;
    }

    // The realm file: bind-mounted under `aspire run`; baked into a derived image in the cluster, which has no host
    // folders to mount.
    private static IResourceBuilder<KeycloakResource> WithAcmeRealm(this IResourceBuilder<KeycloakResource> keycloak)
    {
        if (!keycloak.ApplicationBuilder.IsLocalCluster())
        {
            return keycloak.WithRealmImport("./Realms");
        }
        var image = keycloak.Resource.Annotations.OfType<ContainerImageAnnotation>().Single();
        return keycloak.WithDockerfile("./Realms")
            .WithBuildArg("KEYCLOAK_IMAGE", $"{image.Registry}/{image.Image}:{image.Tag}")
            .WithKeycloakOverHttp(LocalCluster.KeycloakUrl);
    }

    // Blob-triggered on each original the API stores. `aspire run` hosts it through the Functions integration (needs
    // the Azure Functions Core Tools, `func`, on the PATH); the cluster runs its container image (the Functions SDK's
    // own base image) against the cluster's Azurite.
    public static void AddPhotoProcessor(this IDistributedApplicationBuilder builder, PhotoStorage storage)
    {
        if (!builder.IsLocalCluster())
        {
            builder.AddAzureFunctionsProject<Projects.Airbnb_Functions>("photo-processor")
                .WithHostStorage((IResourceBuilder<AzureStorageResource>)storage.Server)
                .WithReference(storage.Blobs)
                .WaitFor(storage.Server);
            return;
        }
        builder.AddProject<Projects.Airbnb_Functions>("photo-processor")
            .WithEnvironment("FUNCTIONS_WORKER_RUNTIME", "dotnet-isolated")
            .WithEnvironment("AzureWebJobsStorage", storage.Blobs.Resource.ConnectionStringExpression)
            .WithReference(storage.Blobs)
            .WaitFor(storage.Server);
    }

    // Passed to the API as secret parameters (masked in the dashboard), and only when both values are configured: an
    // unset parameter would hold every `aspire run` at a prompt.
    private static IResourceBuilder<ProjectResource> WithSocialProvider(this IResourceBuilder<ProjectResource> api, string provider)
    {
        var builder = api.ApplicationBuilder;
        if (string.IsNullOrWhiteSpace(builder.Configuration[$"Identity:{provider}:ClientId"])
            || string.IsNullOrWhiteSpace(builder.Configuration[$"Identity:{provider}:ClientSecret"]))
        {
            return api;
        }
        var name = provider.ToLowerInvariant();
        return api
            .WithEnvironment($"Identity__External__{provider}__ClientId",
                builder.AddParameterFromConfiguration($"{name}-client-id", $"Identity:{provider}:ClientId"))
            .WithEnvironment($"Identity__External__{provider}__ClientSecret",
                builder.AddParameterFromConfiguration($"{name}-client-secret", $"Identity:{provider}:ClientSecret", secret: true));
    }
}
