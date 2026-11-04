// Small helpers every service's setup shares.
internal static class Conventions
{
    // The services' health endpoint (ServiceDefaults maps it).
    public const string HealthPath = "/health";

    // A secret the AppHost generates once and keeps in user secrets: service keys, admin keys, signing keys.
    public static IResourceBuilder<ParameterResource> AddGeneratedKey(this IDistributedApplicationBuilder builder, string name, int minLength = 32) =>
        builder.AddParameter(name, new GenerateParameterDefault { MinLength = minLength, Special = false }, secret: true);

    // An HTTP API: health-checked, and its dashboard link opens its Scalar reference (development only).
    public static IResourceBuilder<ProjectResource> AsHttpApi(this IResourceBuilder<ProjectResource> project) =>
        project.WithHttpHealthCheck(HealthPath)
            .WithUrlForEndpoint("http", url =>
            {
                url.Url = "/scalar";
                url.DisplayText = "API reference";
            });

    // A dashboard command that POSTs to an admin endpoint with the X-Admin-Key header.
    public static IResourceBuilder<ProjectResource> WithAdminCommand(this IResourceBuilder<ProjectResource> project,
        string path, string displayName, IResourceBuilder<ParameterResource> adminKey, HttpCommandOptions options,
        string? commandName = null)
    {
        var prepare = options.PrepareRequest;
        options.Method = HttpMethod.Post;
        options.PrepareRequest = async context =>
        {
            context.Request.Headers.Add("X-Admin-Key", await adminKey.Resource.GetValueAsync(context.CancellationToken));
            if (prepare is not null) await prepare(context);
        };
        return project.WithHttpCommand(path, displayName, endpointName: "http", commandName: commandName, commandOptions: options);
    }
}
