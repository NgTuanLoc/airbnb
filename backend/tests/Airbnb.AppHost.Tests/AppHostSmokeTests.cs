using System.Net.Http.Json;
using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.Testing;

namespace Airbnb.AppHost.Tests;

public sealed class AppHostSmokeTests
{
    private static readonly TimeSpan StartupTimeout = TimeSpan.FromMinutes(5);

    // next dev compiles a page on its first request.
    private static readonly TimeSpan FirstPageTimeout = TimeSpan.FromMinutes(3);

    [Fact]
    public async Task The_frontend_serves_backend_data_under_aspire()
    {
        var ct = TestContext.Current.CancellationToken;
        var appHost = await DistributedApplicationTestingBuilder.CreateAsync<Projects.Airbnb_AppHost>(ct);
        await using var app = await appHost.BuildAsync(ct);
        await app.StartAsync(ct);

        using var startup = CancellationTokenSource.CreateLinkedTokenSource(ct);
        startup.CancelAfter(StartupTimeout);
        await app.ResourceNotifications.WaitForResourceHealthyAsync("api", startup.Token);
        var frontend = await app.ResourceNotifications.WaitForResourceHealthyAsync("frontend", startup.Token);

        var env = frontend.Snapshot.EnvironmentVariables;
        Assert.Contains(env, v => v.Name == "DATA_SOURCE" && v.Value == "api");
        Assert.Contains(env, v => v.Name == "API_HTTP" && v.Value?.StartsWith("http://", StringComparison.Ordinal) == true);

        using var api = app.CreateHttpClient("api", "http");
        var listings = await api.GetFromJsonAsync<JsonElement>("/api/listings", ct);
        Assert.Equal(16, listings.GetProperty("meta").GetProperty("total").GetInt32());

        // Server-rendered through getRepositories(): listing, host and reviews all come from the API in api mode.
        using var web = app.CreateHttpClient("frontend");
        web.Timeout = FirstPageTimeout;
        var html = await web.GetStringAsync("/rooms/l1", ct);
        Assert.Contains("Cozy cabin in the pines", html);
    }
}
