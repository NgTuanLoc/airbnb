using Aspire.Hosting.JavaScript;

namespace Airbnb.AppHost;

internal static class AnalyticsExtensions
{
    // Web analytics with Umami (cookieless page views), `aspire run` only, in its own database on the shared Postgres.
    // Umami starts with the login admin / umami. Add the site there (Websites > Add website, domain localhost) and put
    // its website id in this project's user secrets as Umami:WebsiteId: the frontend loads the tracker once it has one.
    public static void AddAnalytics(this IDistributedApplicationBuilder builder, Infrastructure infra,
        IResourceBuilder<NextJsAppResource> frontend)
    {
        if (!builder.ExecutionContext.IsRunMode)
        {
            return;
        }

        var umami = builder.AddUmami("umami")
            .WithPostgreSQL(infra.Postgres.AddDatabase("umamidb"));

        // The browser loads the tracker from Umami and reports to it: next dev runs on the host, so this is localhost.
        frontend.WithEnvironment("UMAMI_URL", umami.GetEndpoint("http"));
        if (builder.Configuration["Umami:WebsiteId"] is { Length: > 0 } websiteId)
        {
            frontend.WithEnvironment("UMAMI_WEBSITE_ID", websiteId);
        }
    }
}
