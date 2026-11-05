// The whole app: `aspire run` runs it locally with the dashboard; `aspire deploy` puts it on the local Kubernetes
// cluster (LocalCluster.cs). Each part is set up in its own file:
//   Infrastructure.cs  Postgres, Redis, the AMQP broker, Kafka, MongoDB, Mailpit, Blob Storage
//   Services.cs        the shared keys, payments and its fake provider, chat + gateway, notifications, the assistant
//   Api.cs             migrations, the API, Acme SSO (Keycloak), the photo processor
//   Frontend.cs        the Next.js app and the URLs a browser uses
//   LoadTest.cs        k6 (aspire run only)
var builder = DistributedApplication.CreateBuilder(args);
var cluster = builder.AddLocalCluster();

var infra = builder.AddInfrastructure();
var keys = Keys.Generate(builder);

var payments = builder.AddPayments(infra, keys);
var chat = builder.AddChat(infra, keys);
var gateway = builder.AddGateway(chat);

var migrations = builder.AddMigrations(infra);
var api = builder.AddApi(infra, keys, migrations, payments);
builder.AddPhotoProcessor(infra.Storage);

var frontend = builder.AddFrontend(api, chat, keys);
var assistant = builder.AddAssistant();
var notifications = builder.AddNotifications(infra, keys);

// What needs the browser's URLs, and the frontend <-> service links that run both ways.
var urls = BrowserUrls.For(frontend, gateway);
builder.AddAcmeSso(keys, api, urls);
// Identity providers send the browser back to the frontend's callback route, which hands the code to the API.
api.WithEnvironment("Identity__External__RedirectBaseUrl", ReferenceExpression.Create($"{urls.Frontend}/api/auth/callback"));
// Emails link to the frontend.
notifications.WithEnvironment("Notifications__FrontendUrl", urls.Frontend);
// The assistant's tools read the catalog through the frontend's public API, where seed and host listings both live.
assistant.WithEnvironment("Assistant__CatalogUrl", frontend.GetEndpoint("http"));
frontend.WithEnvironment("CHAT_HUB_URL", ReferenceExpression.Create($"{urls.Gateway}/chat/hub"))
    .WithEnvironment("ASSISTANT_HTTP", assistant.GetEndpoint("http"))
    .WithEnvironment("NOTIFICATIONS_HTTP", notifications.GetEndpoint("http"));

builder.AddLoadTest(api);

builder.UsePersistentVolumes(cluster);
await builder.Build().RunAsync();
