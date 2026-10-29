using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Airbnb.Chat.Tests.Integration;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Driver;

[assembly: AssemblyFixture(typeof(ChatFixture))]

namespace Airbnb.Chat.Tests.Integration;

// The service on real Kestrel (so the hub runs over WebSockets, as for browsers) against a real MongoDB. Readiness by
// port: log checks miss the startup line when the host's and the Docker VM's clocks disagree.
public sealed class ChatFixture : IAsyncLifetime
{
    public const string ServiceKey = "test-chat-service-key";
    public const string TokenKey = "test-chat-token-key-0123456789abcdef";
    private const int MongoPort = 27017;
    private const int RedisPort = 6379;

    // Short, so the demo-host tests don't wait the real 1.5 s.
    public static readonly TimeSpan AutoReplyDelay = TimeSpan.FromMilliseconds(300);

    // The SignalR backplane every instance shares.
    private readonly IContainer _redis = new ContainerBuilder("redis:8.6")
        .WithPortBinding(RedisPort, assignRandomHostPort: true)
        .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(RedisPort))
        .Build();

    // GLIBC_TUNABLES: as in the AppHost, MongoDB 8's tcmalloc crashes on Linux 6.19+ (SERVER-121912) unless glibc keeps rseq.
    private readonly IContainer _mongo = new ContainerBuilder("mongo:8.0")
        .WithEnvironment("GLIBC_TUNABLES", "glibc.pthread.rseq=1")
        .WithPortBinding(MongoPort, assignRandomHostPort: true)
        .WithWaitStrategy(Wait.ForUnixContainer().UntilInternalTcpPortIsAvailable(MongoPort))
        .Build();

    private WebApplicationFactory<Program>? _service;

    public Uri BaseAddress { get; private set; } = null!;

    public string MongoConnectionString => $"mongodb://{_mongo.Hostname}:{_mongo.GetMappedPublicPort(MongoPort)}/chat";

    public IMongoDatabase Database => new MongoClient(MongoConnectionString).GetDatabase("chat");

    public async ValueTask InitializeAsync()
    {
        await _mongo.StartAsync();
        await _redis.StartAsync();
        _service = StartInstance();
        BaseAddress = AddressOf(_service);
    }

    // One instance of the service on its own Kestrel port.
    public WebApplicationFactory<Program> StartInstance(Action<IWebHostBuilder>? configure = null)
    {
        var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            // Port 0: each instance gets a free port (Kestrel's default would be 5000 for all of them).
            builder.UseSetting("urls", "http://127.0.0.1:0")
                .UseSetting("ConnectionStrings:chatdb", MongoConnectionString)
                .UseSetting("Chat:ServiceKey", ServiceKey)
                .UseSetting("Chat:TokenKey", TokenKey)
                .UseSetting("ConnectionStrings:redis", $"{_redis.Hostname}:{_redis.GetMappedPublicPort(RedisPort)}")
                .UseSetting("Chat:AutoReplyDelay", AutoReplyDelay.ToString());
            configure?.Invoke(builder);
        });
        factory.UseKestrel();
        factory.StartServer();
        return factory;
    }

    public static Uri AddressOf(WebApplicationFactory<Program> factory) =>
        new(factory.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First());

    // A token as the Identity module signs it (chat spec: "Authentication: token exchange").
    public static string TokenFor(string userId, string name = "Someone", TimeSpan? lifetime = null, string audience = "chat", string key = TokenKey)
    {
        var now = DateTime.UtcNow;
        var expires = now + (lifetime ?? TimeSpan.FromMinutes(10));
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = "airbnb-identity",
            Audience = audience,
            IssuedAt = expires < now ? expires.AddMinutes(-10) : now,
            NotBefore = expires < now ? expires.AddMinutes(-10) : now,
            Expires = expires,
            Claims = new Dictionary<string, object> { ["sub"] = userId, ["name"] = name },
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256),
        });
    }

    public static string NewUserId() => $"usr_{Guid.NewGuid():N}";

    public static string NewListingId() => $"hl-{Guid.NewGuid()}";

    // A WebSocket connection to the hub, the way the browser connects (no negotiate request).
    public static async Task<HubConnection> ConnectAsync(Uri baseAddress, string token, CancellationToken ct)
    {
        var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(baseAddress, "/hub"), options =>
            {
                options.AccessTokenProvider = () => Task.FromResult<string?>(token);
                options.SkipNegotiation = true;
                options.Transports = HttpTransportType.WebSockets;
            })
            .Build();
        await connection.StartAsync(ct);
        return connection;
    }

    public Task<HubConnection> ConnectAsync(string token, CancellationToken ct) => ConnectAsync(BaseAddress, token, ct);

    public HttpClient Client(string? serviceKey = ServiceKey)
    {
        var client = new HttpClient { BaseAddress = BaseAddress };
        if (serviceKey is not null)
        {
            client.DefaultRequestHeaders.Add("X-Service-Key", serviceKey);
        }
        return client;
    }

    // What the Next server sends when a guest presses "Message host".
    public static object Start(string listingId, string hostId, string guestId, bool hostIsDemo = false) => new
    {
        listingId,
        listingTitle = "Sunny cabin",
        hostId,
        hostName = "Hana Host",
        guestId,
        guestName = "Gus Guest",
        hostIsDemo,
    };

    public async Task<string> StartConversationAsync(string listingId, string hostId, string guestId, CancellationToken ct, bool hostIsDemo = false)
    {
        using var client = Client();
        using var response = await client.PostAsJsonAsync("/conversations", Start(listingId, hostId, guestId, hostIsDemo), ct);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("id").GetString()!;
    }

    public async ValueTask DisposeAsync()
    {
        // Null when InitializeAsync failed before starting it: keep that failure, not a NullReferenceException, in the output.
        if (_service is not null)
        {
            await _service.DisposeAsync();
        }
        await _redis.DisposeAsync();
        await _mongo.DisposeAsync();
    }
}
