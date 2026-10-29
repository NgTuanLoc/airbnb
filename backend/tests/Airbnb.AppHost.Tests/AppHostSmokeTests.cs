using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using System.Web;
using Aspire.Hosting;
using Aspire.Hosting.Testing;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using SkiaSharp;

namespace Airbnb.AppHost.Tests;

public sealed class AppHostSmokeTests
{
    private static readonly TimeSpan StartupTimeout = TimeSpan.FromMinutes(5);

    // next dev compiles a page on its first request.
    private static readonly TimeSpan FirstPageTimeout = TimeSpan.FromMinutes(3);

    // The blob trigger polls Azurite, so the first photo can take a while.
    private static readonly TimeSpan PhotoProcessingTimeout = TimeSpan.FromSeconds(90);

    // A fresh consumer group joins and is assigned partitions before it counts anything.
    private static readonly TimeSpan ViewCountTimeout = TimeSpan.FromSeconds(60);

    // Outbox relay, broker, the service's inbox and SMTP: a few hops, each quick.
    private static readonly TimeSpan EmailTimeout = TimeSpan.FromSeconds(60);

    // The demo host answers after 1.5 s; the rest is the gateway and the first connection.
    private static readonly TimeSpan ChatReplyTimeout = TimeSpan.FromSeconds(30);

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
        await A_listing_view_reaches_its_count_through_kafka(api, ct);
        await A_booking_is_paid_and_emailed(app, api, ct);
        await A_declined_card_books_nothing(api, ct);
        await A_guest_chats_with_a_demo_host_through_the_gateway(app, ct);
    }

    // The third microservice end to end: the frontend vouches for the listing's host to the chat service, the API signs
    // a chat token, and the browser's WebSocket goes through the YARP gateway to a chat instance, where l13's demo host
    // answers live. A fresh guest each run: MongoDB keeps conversations, and a demo host answers each one only once.
    private static async Task A_guest_chats_with_a_demo_host_through_the_gateway(DistributedApplication app, CancellationToken ct)
    {
        using var browser = new HttpClient(new BrowserCookies { InnerHandler = new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false } })
        {
            BaseAddress = app.GetEndpoint("frontend", "http"),
            Timeout = FirstPageTimeout,
        };
        using var registered = await browser.PostAsJsonAsync("/api/auth/register",
            new { name = "Chat Guest", email = $"chat-{Guid.NewGuid():N}@example.com", password = "correct-horse", confirmPassword = "correct-horse" }, ct);
        Assert.True(registered.IsSuccessStatusCode, await registered.Content.ReadAsStringAsync(ct));

        using var started = await browser.PostAsJsonAsync("/api/chat/conversations", new { listingId = "l13" }, ct);
        Assert.True(started.IsSuccessStatusCode, await started.Content.ReadAsStringAsync(ct));
        var conversationId = (await started.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("data").GetProperty("id").GetString()!;
        var token = (await browser.GetFromJsonAsync<JsonElement>("/api/chat/token", ct)).GetProperty("data");
        var hubUrl = token.GetProperty("hubUrl").GetString()!;
        Assert.EndsWith("/chat/hub", hubUrl);

        await using var hub = new HubConnectionBuilder()
            .WithUrl(hubUrl, options =>
            {
                options.AccessTokenProvider = () => Task.FromResult(token.GetProperty("token").GetString());
                options.SkipNegotiation = true;
                options.Transports = HttpTransportType.WebSockets;
            })
            .Build();
        var received = Channel.CreateUnbounded<JsonElement>();
        hub.On<JsonElement>("message", message => received.Writer.TryWrite(message));
        await hub.StartAsync(ct);

        var sent = await hub.InvokeAsync<JsonElement>("Send", conversationId, "Is the loft free next month?", ct);
        var guestId = sent.GetProperty("senderId").GetString();

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(ChatReplyTimeout);
        JsonElement reply;
        do
        {
            reply = await received.Reader.ReadAsync(timeout.Token);
        }
        while (reply.GetProperty("senderId").GetString() == guestId);
        Assert.Equal(conversationId, reply.GetProperty("conversationId").GetString());
        Assert.Contains("demo host", reply.GetProperty("text").GetString());
    }

    private static async Task<HttpResponseMessage> BookL14Async(HttpClient api, string email, string cardNumber, CancellationToken ct)
    {
        using var registered = await api.PostAsJsonAsync("/api/auth/register", new { name = "Mail Guest", email, password = "correct-horse" }, ct);
        registered.EnsureSuccessStatusCode();
        var token = (await registered.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("data").GetProperty("token").GetString();

        // A random far-future month, so runs against the persistent dev database never collide.
        var checkIn = DateOnly.FromDateTime(DateTime.UtcNow).AddMonths(Random.Shared.Next(24, 1200));
        using var book = new HttpRequestMessage(HttpMethod.Post, "/api/bookings")
        {
            Content = JsonContent.Create(new
            {
                listingId = "l14",
                checkIn = checkIn.ToString("yyyy-MM-dd"),
                checkOut = checkIn.AddDays(2).ToString("yyyy-MM-dd"),
                adults = 1,
                children = 0,
                card = new { number = cardNumber, expMonth = 12, expYear = DateTime.UtcNow.Year + 3, cvc = "123" },
            }),
        };
        book.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return await api.SendAsync(book, ct);
    }

    // Both microservices end to end: the monolith charges the booking through the payment service over HTTP, publishes
    // booking-confirmed through the outbox and the broker, and the notification service emails the guest through Mailpit.
    private static async Task A_booking_is_paid_and_emailed(DistributedApplication app, HttpClient api, CancellationToken ct)
    {
        var email = $"mail-{Guid.NewGuid():N}@example.com";
        using var booked = await BookL14Async(api, email, "4242424242424242", ct);
        Assert.Equal(HttpStatusCode.Created, booked.StatusCode);

        using var mailpit = new HttpClient { BaseAddress = app.GetEndpoint("mailpit", "http") };
        var subjects = new List<string>();
        var deadline = DateTime.UtcNow + EmailTimeout;
        while (subjects.Count == 0 && DateTime.UtcNow < deadline)
        {
            await Task.Delay(TimeSpan.FromSeconds(1), ct);
            var search = await mailpit.GetFromJsonAsync<JsonElement>($"api/v1/search?query={Uri.EscapeDataString($"to:{email}")}", ct);
            subjects = [.. search.GetProperty("messages").EnumerateArray().Select(m => m.GetProperty("Subject").GetString()!)];
        }
        var subject = Assert.Single(subjects);
        Assert.StartsWith("Your stay at ", subject);
        Assert.EndsWith(" is confirmed", subject);
    }

    // The payment service's decline reaches the guest as a 402 with its reason.
    private static async Task A_declined_card_books_nothing(HttpClient api, CancellationToken ct)
    {
        using var declined = await BookL14Async(api, $"declined-{Guid.NewGuid():N}@example.com", "4000000000000002", ct);

        Assert.Equal(HttpStatusCode.PaymentRequired, declined.StatusCode);
        Assert.Equal("card_declined", (await declined.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("code").GetString());
    }

    // Listing views end to end: the API publishes the view to Kafka, the projection counts it, and the count is served.
    // The Kafka and Postgres volumes outlive runs, so l16 may already have views: wait for one more.
    private static async Task A_listing_view_reaches_its_count_through_kafka(HttpClient api, CancellationToken ct)
    {
        var before = await ViewsLastWeekAsync(api, "l16", ct);

        using var viewed = await api.PostAsync("/api/listings/l16/views", content: null, ct);
        Assert.Equal(HttpStatusCode.Accepted, viewed.StatusCode);

        var after = before;
        var deadline = DateTime.UtcNow + ViewCountTimeout;
        while (after <= before && DateTime.UtcNow < deadline)
        {
            await Task.Delay(TimeSpan.FromSeconds(1), ct);
            after = await ViewsLastWeekAsync(api, "l16", ct);
        }
        Assert.True(after > before, $"l16 still had {after} views after {ViewCountTimeout.TotalSeconds}s");
    }

    private static async Task<long> ViewsLastWeekAsync(HttpClient api, string listingId, CancellationToken ct) =>
        (await api.GetFromJsonAsync<JsonElement>($"/api/listings/{listingId}/views", ct))
            .GetProperty("data").GetProperty("last7Days").GetInt64();

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
