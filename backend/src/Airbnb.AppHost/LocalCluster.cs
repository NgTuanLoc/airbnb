using Aspire.Hosting.Kubernetes;
using Aspire.Hosting.Kubernetes.Resources;
using YamlDotNet.Serialization;

namespace Airbnb.AppHost;

// `aspire deploy` / `aspire publish`: the app as a Helm chart on a local Kubernetes cluster (Docker Desktop's, the
// current kubectl context). Docker Desktop opens each LoadBalancer service's port on the machine, so the browser
// reaches the frontend, the chat gateway, Keycloak, Mailpit and the Aspire dashboard on fixed ports. Everything else
// stays inside the cluster. `aspire run` ignores all of this.
internal static class LocalCluster
{
    public const int FrontendPort = 3000;
    public const int GatewayPort = 5000;
    public const int KeycloakPort = 8080;
    public const int MailpitPort = 8025;
    public const int DashboardPort = 18888;
    // The registry deploy-local.ps1 runs (registry:2); the cluster pulls through the same Docker daemon.
    public const int RegistryPort = 5001;

    public static readonly string FrontendUrl = $"http://localhost:{FrontendPort}";
    public static readonly string GatewayUrl = $"http://localhost:{GatewayPort}";
    // Both the browser and the API pod reach Keycloak at this URL, so the issuer the API checks is the one the
    // browser's tokens carry. Docker Desktop's hosts entry sends the name to 127.0.0.1 on the machine (where the
    // LoadBalancer ports are); ReachesKeycloak points it at the machine from inside the API pod.
    public const string KeycloakHost = "kubernetes.docker.internal";
    public static readonly string KeycloakUrl = $"http://{KeycloakHost}:{KeycloakPort}"; // NOSONAR: the local cluster has no TLS
    // Docker Desktop's address for the machine inside containers: what host.docker.internal resolves to there.
    private const string DockerDesktopHostIp = "192.168.65.254"; // NOSONAR: fixed by Docker Desktop

    // The Helm release, its namespace and the images' repository.
    private const string AppName = "airbnb";

    // Azurite's account for the cluster's photo storage.
    public const string StorageAccount = AppName;

    public static bool IsLocalCluster(this IDistributedApplicationBuilder builder) => builder.ExecutionContext.IsPublishMode;

    public static IResourceBuilder<KubernetesEnvironmentResource> AddLocalCluster(this IDistributedApplicationBuilder builder) =>
        builder.AddKubernetesEnvironment("k8s")
            .WithContainerRegistry(builder.AddContainerRegistry("registry", $"localhost:{RegistryPort}", AppName))
            .WithHelm(helm => helm.WithNamespace(AppName).WithReleaseName(AppName))
            .WithDashboard(dashboard => dashboard.WithServicePort(DashboardPort)
                .PublishAsKubernetesService(k => k.Service!.Spec.Type = "LoadBalancer"));

    // Opens the resource's service on the machine at `port`, which must be the port Aspire gave its http endpoint:
    // the other services address it there too. Docker Desktop opens every port of the service, so `onlyThisPort`
    // drops the others (when nothing in the cluster uses them) rather than take more of the machine's ports.
    public static IResourceBuilder<T> OnLocalClusterPort<T>(this IResourceBuilder<T> resource, int port, bool onlyThisPort = false)
        where T : IComputeResource =>
        resource.PublishAsKubernetesService(k =>
        {
            var service = k.Service ?? throw new InvalidOperationException($"{resource.Resource.Name} has no service to expose");
            if (!service.Spec.Ports.Any(p => p.Port == port))
            {
                throw new InvalidOperationException(
                    $"{resource.Resource.Name}'s service has no port {port}: {string.Join(", ", service.Spec.Ports.Select(p => p.Port))}");
            }
            if (onlyThisPort)
            {
                service.Spec.Ports.RemoveAll(p => p.Port != port);
            }
            service.Spec.Type = "LoadBalancer";
        });

    // A program that does its work and exits (the migrations) runs as a Job rather than a Deployment, which would
    // restart it forever. A Helm hook, so each deploy replaces it (a Job's pod template can't change in place) and
    // Helm waits for it to finish.
    public static IResourceBuilder<T> RunsOnceOnLocalCluster<T>(this IResourceBuilder<T> resource) where T : IComputeResource =>
        resource.PublishAsKubernetesService(k =>
        {
            var template = k.Workload!.PodTemplate;
            template.Spec.RestartPolicy = "OnFailure";
            var job = new Job { Spec = { Template = template } };
            job.Metadata.Name = $"{resource.Resource.Name}-job";
            job.Metadata.Labels = k.Workload.Metadata.Labels;
            job.Metadata.Annotations["helm.sh/hook"] = "post-install,post-upgrade";
            job.Metadata.Annotations["helm.sh/hook-delete-policy"] = "before-hook-creation";
            k.Workload = job;
        });

    // Aspire downloads Ollama models itself under `aspire run`; in the cluster a Job asks Ollama to, retrying until
    // Ollama is up. Named after the model, so changing the model replaces the Job.
    public static IResourceBuilder<OllamaResource> PullsModelOnLocalCluster(this IResourceBuilder<OllamaResource> ollama, string model) =>
        ollama.PublishAsKubernetesService(k =>
        {
            var job = new Job();
            job.Metadata.Name = $"ollama-pull-{new string(model.Select(c => char.IsAsciiLetterOrDigit(c) ? c : '-').ToArray())}";
            job.Spec.Template.Spec.RestartPolicy = "OnFailure";
            job.Spec.Template.Spec.Containers.Add(new ContainerV1
            {
                Name = "pull",
                Image = "curlimages/curl:8.17.0",
                Args =
                {
                    "--fail", "--silent", "--show-error", "--retry", "60", "--retry-connrefused", "--retry-delay", "5",
                    "http://ollama-service:11434/api/pull", "--data", // NOSONAR: inside the cluster, no TLS
                    $"{{\"model\":\"{model}\",\"stream\":false}}",
                },
            });
            k.AdditionalResources.Add(job);
        });

    // From inside the API pod, KeycloakHost is the machine, whose port KeycloakPort is Keycloak's LoadBalancer.
    public static IResourceBuilder<ProjectResource> ReachesKeycloak(this IResourceBuilder<ProjectResource> api) =>
        api.PublishAsKubernetesService(k =>
            k.Workload!.PodTemplate.Spec.HostAliases.Add(new HostAliasV1 { Ip = DockerDesktopHostIp, Hostnames = { KeycloakHost } }));

    // Keycloak's production mode (what Aspire publishes) refuses plain HTTP and needs to know its public URL. Its
    // management port (9000: health, metrics) stays off the machine, where SonarQube wants 9000.
    public static IResourceBuilder<KeycloakResource> WithKeycloakOverHttp(this IResourceBuilder<KeycloakResource> keycloak, string url) =>
        keycloak.WithEnvironment("KC_HTTP_ENABLED", "true")
            .WithEnvironment("KC_HOSTNAME", url)
            .OnLocalClusterPort(KeycloakPort, onlyThisPort: true);

    // Every container's volume becomes a persistent volume claim. Aspire would publish them as emptyDir volumes named
    // after the AppHost ("airbnb.apphost-…-postgres-data"): lost with the pod, and refused for the dots in the name.
    public static void UsePersistentVolumes(this IDistributedApplicationBuilder builder, IResourceBuilder<KubernetesEnvironmentResource> cluster)
    {
        if (!builder.IsLocalCluster())
        {
            return;
        }
        foreach (var container in builder.Resources.OfType<ContainerResource>().ToList())
        {
            var mounts = container.Annotations.OfType<ContainerMountAnnotation>().Where(m => m.Type == ContainerMountType.Volume).ToList();
            foreach (var (mount, i) in mounts.Select((m, i) => (m, i)))
            {
                container.Annotations.Remove(mount);
                // Docker Desktop's hostpath storage doesn't enforce the size; 10Gi leaves room for the Ollama model.
                var volume = cluster.AddPersistentVolume(mounts.Count == 1 ? $"{container.Name}-data" : $"{container.Name}-data-{i}")
                    .WithCapacity("10Gi");
                builder.CreateResourceBuilder(container).WithPersistentVolume(volume, mount.Target);
            }
        }
    }
}

// A batch/v1 Job; Aspire's Kubernetes publisher models only Deployments and StatefulSets.
internal sealed class Job() : Workload("batch/v1", "Job")
{
    [YamlMember(Alias = "spec")]
    public JobSpec Spec { get; set; } = new();

    public override PodTemplateSpecV1 PodTemplate => Spec.Template;
}

internal sealed class JobSpec
{
    [YamlMember(Alias = "backoffLimit")]
    public int BackoffLimit { get; set; } = 10;

    [YamlMember(Alias = "template")]
    public PodTemplateSpecV1 Template { get; set; } = new();
}
