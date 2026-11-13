namespace Airbnb.AppHost;

// The k6 load test (perf/k6/load.js), under `aspire run` only: it mounts folders from this machine, and starts only
// from the dashboard's Start button (or `aspire resource k6 start`).
internal static class LoadTestExtensions
{
    public static void AddLoadTest(this IDistributedApplicationBuilder builder, IResourceBuilder<ProjectResource> api)
    {
        if (!builder.ExecutionContext.IsRunMode)
        {
            return;
        }

        // Kept in user secrets (a plain generated parameter changes every run): the k6 user registered once must log in again.
        var password = builder.AddResource(
            ParameterResourceBuilderExtensions.CreateDefaultPasswordParameter(builder, "k6-user-password", special: false));

        // Each run writes perf/k6/reports (gitignored): index.html, the per-endpoint report from load.js's
        // handleSummary, and dashboard.html, k6's web dashboard export (charts over time). k6 runs as a non-root user,
        // hence the open mode off Windows.
        var reports = Directory.CreateDirectory(Path.Combine(builder.AppHostDirectory, "../../perf/k6/reports")).FullName;
        if (!OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(reports, (UnixFileMode)0b111_111_111);
        }

        // No vus/duration here: they would replace the script's two scenarios. WithK6OtlpEnvironment is left out
        // because k6 ignores the K6_OTEL_EXPORTER_OTLP_* names it sets. The live dashboard link works only while a run
        // is going.
        var k6 = builder.AddK6("k6")
            .WithBindMount("../../perf/k6", "/scripts", isReadOnly: true)
            .WithBindMount(reports, "/reports")
            .WithScript("/scripts/load.js")
            .WithEnvironment("API_URL", api.GetEndpoint("http"))
            .WithEnvironment("K6_USER_PASSWORD", password)
            .WithEnvironment("K6_WEB_DASHBOARD", "true")
            .WithEnvironment("K6_WEB_DASHBOARD_HOST", "0.0.0.0")
            .WithEnvironment("K6_WEB_DASHBOARD_EXPORT", "/reports/dashboard.html")
            .WithHttpEndpoint(targetPort: 5665, name: "dashboard")
            .WithUrlForEndpoint("dashboard", url => url.DisplayText = "Live dashboard (while running)")
            .WaitFor(api)
            .WithExplicitStart();

        builder.AddContainer("k6-report", "nginx", "1.29-alpine")
            .WithBindMount(reports, "/usr/share/nginx/html", isReadOnly: true)
            .WithHttpEndpoint(targetPort: 80)
            .WithUrlForEndpoint("http", url => url.DisplayText = "Last run's report")
            .WithParentRelationship(k6);
    }
}
