using Aspire.Hosting.JavaScript;
using Aspire.Hosting.Yarp;

namespace Airbnb.AppHost;

// The URLs a browser uses, which some services hand out (links in emails, OAuth redirects, the chat hub address).
// `aspire run`: localhost and each endpoint's port, never a container-network name (from a container, an endpoint's
// own URL would be aspire.dev.internal). The local cluster: the LoadBalancer ports Docker Desktop opens on the machine.
internal sealed record BrowserUrls(ReferenceExpression Frontend, ReferenceExpression Gateway)
{
    public static BrowserUrls For(IResourceBuilder<NextJsAppResource> frontend, IResourceBuilder<YarpResource> gateway) =>
        frontend.ApplicationBuilder.IsLocalCluster()
            ? new(ReferenceExpression.Create($"{LocalCluster.FrontendUrl}"), ReferenceExpression.Create($"{LocalCluster.GatewayUrl}"))
            : new(Localhost(frontend.GetEndpoint("http")), Localhost(gateway.GetEndpoint("http")));

    private static ReferenceExpression Localhost(EndpointReference endpoint) =>
        ReferenceExpression.Create($"http://localhost:{endpoint.Property(EndpointProperty.Port)}");
}

internal static class FrontendExtensions
{
    // The Next.js app (frontend/). Port 3000 so Playwright (baseURL localhost:3000, reuseExistingServer) can run e2e
    // against it. `aspire run` starts `next dev`; the cluster runs Next's standalone server from a generated image.
    public static IResourceBuilder<NextJsAppResource> AddFrontend(this IDistributedApplicationBuilder builder,
        IResourceBuilder<ProjectResource> api, IResourceBuilder<ProjectResource> chat, Keys keys) =>
        builder.AddNextJsApp("frontend", "../../../frontend")
            // The image builds and runs on Node 24, like CI and the dev container (Aspire's default is 22).
            .WithDockerfileBaseImage("node:24-slim", "node:24-alpine")
            .WithHttpEndpoint(port: LocalCluster.FrontendPort, env: "PORT")
            .WithReference(api)
            .WaitFor(api)
            .WithEnvironment("DATA_SOURCE", builder.Configuration["Frontend:DataSource"] ?? "api")
            .WithEnvironment("BOOKINGS_QUOTE_KEY", keys.BookingsQuote)
            // Chat: Next starts conversations straight on the service (the browser reaches the hub via the gateway).
            .WithEnvironment("CHAT_HTTP", chat.GetEndpoint("http"))
            .WithEnvironment("CHAT_SERVICE_KEY", keys.ChatService)
            .OnLocalClusterPort(LocalCluster.FrontendPort);
}
