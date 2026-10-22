using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Web;
using Aspire.Hosting;
using Aspire.Hosting.Testing;
using SkiaSharp;

namespace Airbnb.AppHost.Tests;

public sealed class AppHostSmokeTests
{
    private static readonly TimeSpan StartupTimeout = TimeSpan.FromMinutes(5);

    // next dev compiles a page on its first request.
    private static readonly TimeSpan FirstPageTimeout = TimeSpan.FromMinutes(3);

    // The blob trigger polls Azurite, so the first photo can take a while.
    private static readonly TimeSpan PhotoProcessingTimeout = TimeSpan.FromSeconds(90);

    [Fact]
    public async Task The_frontend_serves_backend_data_under_aspire()
    {
        var ct = TestContext.Current.CancellationToken;
        // Explicit so the test doesn't depend on Frontend:DataSource staying "api" in appsettings.json.
        var appHost = await DistributedApplicationTestingBuilder.CreateAsync<Projects.Airbnb_AppHost>(
            ["--Frontend:DataSource=api"], ct);
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

        // Enterprise SSO end to end (OAuth spec §3): the frontend starts the flow, Keycloak's Acme realm signs alex in
        // through its real login form, and the frontend's callback turns the code into a session.
        await app.ResourceNotifications.WaitForResourceHealthyAsync("keycloak", startup.Token);
        using var browser = new HttpClient(new BrowserCookies { InnerHandler = new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false } })
        {
            BaseAddress = app.GetEndpoint("frontend", "http"),
            Timeout = FirstPageTimeout,
        };

        using var started = await browser.PostAsJsonAsync("/api/auth/oauth/start", new { provider = "sso", email = "alex@acme.test", next = "/trips" }, ct);
        Assert.True(started.IsSuccessStatusCode, await started.Content.ReadAsStringAsync(ct));
        var keycloakLogin = (await started.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("data").GetProperty("redirectUrl").GetString()!;
        Assert.Contains("/realms/acme/protocol/openid-connect/auth?", keycloakLogin);

        var loginPage = await browser.GetStringAsync(keycloakLogin, ct);
        var formAction = WebUtility.HtmlDecode(Regex.Match(loginPage, "<form[^>]*id=\"kc-form-login\"[^>]*action=\"([^\"]+)\"").Groups[1].Value);
        using var signedIn = await browser.PostAsync(formAction, new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["username"] = "alex@acme.test",
            ["password"] = "acme-demo",
            ["credentialId"] = "",
        }), ct);
        Assert.Equal(HttpStatusCode.Found, signedIn.StatusCode);
        var callback = signedIn.Headers.Location!;
        Assert.Equal("/api/auth/callback/sso-acme", callback.AbsolutePath);
        Assert.NotNull(HttpUtility.ParseQueryString(callback.Query)["code"]);

        using var landed = await browser.GetAsync(callback, ct);
        Assert.Equal(HttpStatusCode.SeeOther, landed.StatusCode);
        Assert.Equal("/trips", landed.Headers.Location?.OriginalString);
        var session = await browser.GetFromJsonAsync<JsonElement>("/api/auth/session", ct);
        Assert.Equal("alex@acme.test", session.GetProperty("data").GetProperty("email").GetString());

        await A_photo_upload_is_processed_by_the_function(api, ct);
    }

    // Host photo uploads end to end: the API stores the original in Azurite, the blob trigger runs the photo-processor
    // function, and the processed WebP is served.
    private static async Task A_photo_upload_is_processed_by_the_function(HttpClient api, CancellationToken ct)
    {
        using var registered = await api.PostAsJsonAsync("/api/auth/register",
            new { name = "Photo Host", email = $"photos-{Guid.NewGuid():N}@example.com", password = "correct-horse" }, ct);
        registered.EnsureSuccessStatusCode();
        var token = (await registered.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("data").GetProperty("token").GetString();

        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(Jpeg(800, 600));
        file.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        form.Add(file, "file", "photo.jpg");
        using var upload = new HttpRequestMessage(HttpMethod.Post, "/api/photos") { Content = form };
        upload.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var uploaded = await api.SendAsync(upload, ct);
        Assert.Equal(HttpStatusCode.Created, uploaded.StatusCode);
        var id = (await uploaded.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("data").GetProperty("id").GetString();

        var status = "pending";
        var deadline = DateTime.UtcNow + PhotoProcessingTimeout;
        while (status == "pending" && DateTime.UtcNow < deadline)
        {
            await Task.Delay(TimeSpan.FromSeconds(1), ct);
            using var check = new HttpRequestMessage(HttpMethod.Get, $"/api/photos/{id}");
            check.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var checkedStatus = await api.SendAsync(check, ct);
            status = (await checkedStatus.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("data").GetProperty("status").GetString();
        }
        Assert.Equal("ready", status);

        using var image = await api.GetAsync($"/api/photos/{id}/image", ct);
        Assert.Equal(HttpStatusCode.OK, image.StatusCode);
        Assert.Equal("image/webp", image.Content.Headers.ContentType?.MediaType);
    }

    private static byte[] Jpeg(int width, int height)
    {
        using var bitmap = new SKBitmap(width, height);
        bitmap.Erase(SKColors.SteelBlue);
        using var image = SKImage.FromBitmap(bitmap);
        return image.Encode(SKEncodedImageFormat.Jpeg, 90).ToArray();
    }

    // A browser's cookie jar for this test: Keycloak's cookies are Secure, which browsers send to http://localhost but
    // CookieContainer doesn't. Cookies are per host, not per port, so one jar serves the frontend and Keycloak alike.
    private sealed class BrowserCookies : DelegatingHandler
    {
        private readonly Dictionary<string, string> _cookies = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (_cookies.Count > 0)
            {
                request.Headers.Add("Cookie", string.Join("; ", _cookies.Select(cookie => $"{cookie.Key}={cookie.Value}")));
            }
            var response = await base.SendAsync(request, cancellationToken);
            if (response.Headers.TryGetValues("Set-Cookie", out var setCookies))
            {
                foreach (var header in setCookies)
                {
                    var pair = header.Split(';')[0];
                    var equals = pair.IndexOf('=');
                    _cookies[pair[..equals]] = pair[(equals + 1)..];
                }
            }
            return response;
        }
    }
}
