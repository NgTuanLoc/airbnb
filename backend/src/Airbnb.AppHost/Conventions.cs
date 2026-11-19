using Aspire.Hosting.Dotnet;
namespace Airbnb.AppHost;

// Small helpers every service's setup shares.
internal static class Conventions
{
    // The services' health endpoints (ServiceDefaults maps them): all checks, and only the process itself.
    public const string HealthPath = "/health";
    private const string AlivePath = "/alive";

    // A secret the AppHost generates once and keeps in user secrets: service keys, admin keys, signing keys.
    public static IResourceBuilder<ParameterResource> AddGeneratedKey(this IDistributedApplicationBuilder builder, string name, int minLength = 32) =>
        builder.AddParameter(name, new GenerateParameterDefault { MinLength = minLength, Special = false }, secret: true);

    // An HTTP API: health-checked (each probe adds the check; on the cluster they're the pod's probes), and its dashboard
    // link opens its Scalar reference (development only). Liveness restarts a pod after 5 minutes without an answer, long
    // enough for a start that waits on migrations or dependencies. (No separate startup probe: each probe names its
    // health check after the endpoint and path, and there are only these two paths.)
    public static IResourceBuilder<DotnetProjectResource> AsHttpApi(this IResourceBuilder<DotnetProjectResource> project) =>
        project.WithHttpProbe(ProbeType.Readiness, HealthPath, endpointName: "http")
            .WithHttpProbe(ProbeType.Liveness, AlivePath, periodSeconds: 10, failureThreshold: 30, endpointName: "http")
            .WithKubernetesProbeSchemes()
            .WithUrlForEndpoint("http", url =>
            {
                url.Url = "/scalar";
                url.DisplayText = "API reference";
            });

    // A dashboard command that POSTs to an admin endpoint with the key in a header (X-Admin-Key unless the service names
    // another).
    public static IResourceBuilder<DotnetProjectResource> WithAdminCommand(this IResourceBuilder<DotnetProjectResource> project,
        string path, string displayName, IResourceBuilder<ParameterResource> adminKey, HttpCommandOptions options,
        string? commandName = null, string keyHeader = "X-Admin-Key")
    {
        var prepare = options.PrepareRequest;
        options.Method = HttpMethod.Post;
        options.PrepareRequest = async context =>
        {
            context.Request.Headers.Add(keyHeader, await adminKey.Resource.GetValueAsync(context.CancellationToken));
            if (prepare is not null) await prepare(context);
        };
        return project.WithHttpCommand(path, displayName, endpointName: "http", commandName: commandName, commandOptions: options);
    }
}
