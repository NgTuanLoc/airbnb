using Airbnb.Chat.Api;
using Airbnb.Chat.Data;
using Airbnb.Chat.Hubs;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR;
using StackExchange.Redis;

// The chat service (docs/superpowers/specs/2026-10-29-chat-service-design.md): guests and hosts message each other live.
// The browser connects straight to the hub (through the gateway) with a JWT from the monolith; the Next server starts
// conversations with the service key.
var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddSingleton(TimeProvider.System);

builder.AddMongoDBClient("chatdb");
builder.Services.AddSingleton<ChatStore>();

var tokenKey = ChatAuth.TokenKey(builder.Configuration);
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options => ChatAuth.Configure(options, tokenKey));
builder.Services.AddAuthorization();
builder.Services.AddSingleton<IUserIdProvider, SubjectUserIdProvider>();
// The Redis backplane: Clients.Users reaches connections on every instance, not just this one.
builder.Services.AddSignalR().AddStackExchangeRedis(
    builder.Configuration.GetConnectionString("redis") ?? throw new InvalidOperationException("ConnectionStrings:redis is required"),
    options => options.Configuration.ChannelPrefix = RedisChannel.Literal("chat"));
builder.Services.AddSingleton<SendLimiter>();
builder.Services.AddSingleton<AutoReplies>();
builder.Services.AddHostedService(services => services.GetRequiredService<AutoReplies>());

var app = builder.Build();

await app.Services.GetRequiredService<ChatStore>().EnsureIndexesAsync(CancellationToken.None);

app.UseAuthentication();
app.UseAuthorization();
app.MapDefaultEndpoints();
app.MapConversations();
// WebSockets only: the long-polling and server-sent-events fallbacks need the negotiate request and sticky sessions,
// which two instances behind the gateway don't have. A connection closes when its token expires; clients reconnect
// with a fresh one.
app.MapHub<ChatHub>("/hub", options =>
{
    options.Transports = HttpTransportType.WebSockets;
    options.CloseOnAuthenticationExpiration = true;
});

await app.RunAsync();
