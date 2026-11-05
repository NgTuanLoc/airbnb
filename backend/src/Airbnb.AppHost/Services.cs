using System.Net.Http.Json;
using Aspire.Hosting.Yarp;
using Aspire.Hosting.Yarp.Transforms;

// The shared secrets between the parts of the app, generated once (user secrets) and passed to both sides.
internal sealed record Keys(
    IResourceBuilder<ParameterResource> PaymentsService,
    IResourceBuilder<ParameterResource> ChatService,
    IResourceBuilder<ParameterResource> ChatToken,
    IResourceBuilder<ParameterResource> BookingsQuote,
    IResourceBuilder<ParameterResource> InsightsAdmin,
    IResourceBuilder<ParameterResource> NotificationsAdmin,
    IResourceBuilder<ParameterResource> AcmeClientSecret,
    IResourceBuilder<ParameterResource> PaymentProvider,
    IResourceBuilder<ParameterResource> PaymentWebhook)
{
    public static Keys Generate(IDistributedApplicationBuilder builder) => new(
        builder.AddGeneratedKey("payments-service-key"),
        builder.AddGeneratedKey("chat-service-key"),
        builder.AddGeneratedKey("chat-token-key"),
        // Only the Next server may send the API a host-listing quote.
        builder.AddGeneratedKey("bookings-quote-key"),
        builder.AddGeneratedKey("insights-admin-key"),
        builder.AddGeneratedKey("notifications-admin-key"),
        builder.AddGeneratedKey("sso-acme-client-secret"),
        // The payment service's API key at the payment provider, and the secret the provider signs its webhooks with.
        builder.AddGeneratedKey("payment-provider-key"),
        builder.AddGeneratedKey("payment-webhook-secret"));
}

// The microservices in services/: each its own solution, run by this AppHost.
internal static class ServiceExtensions
{
    // services/payments: the monolith charges, reads and voids payments over HTTP with a shared service key, and the
    // service refunds cancelled bookings it hears about on the broker. Its own database on the same server. The charges
    // go to the payment provider, which reports each outcome by signed webhook; the service announces outcomes on the
    // broker ("payments" exchange) for Bookings.
    public static IResourceBuilder<ProjectResource> AddPayments(this IDistributedApplicationBuilder builder, Infrastructure infra, Keys keys)
    {
        var provider = builder.AddPaymentProvider(keys);
        var db = infra.Postgres.AddDatabase("paymentsdb", "payments");
        var payments = builder.AddProject<Projects.Airbnb_Payments>("payments", launchProfileName: "http")
            .WithReference(db).WaitFor(db)
            .WithReference(infra.Messaging).WaitFor(infra.Messaging)
            .WithReference(provider).WaitFor(provider)
            .WithEnvironment("Payments__ServiceKey", keys.PaymentsService)
            .WithEnvironment("Payments__ProviderKey", keys.PaymentProvider)
            .WithEnvironment("Payments__WebhookSecret", keys.PaymentWebhook)
            .AsHttpApi();
        // And back: the provider's webhooks go to the payment service.
        provider.WithEnvironment("Provider__WebhookUrl", ReferenceExpression.Create($"{payments.GetEndpoint("http")}/webhooks/provider"));
        return payments;
    }

    // services/payments' fake payment provider (src/Airbnb.PaymentProvider): a stand-in for an outside processor like
    // Stripe. Its commands do what the real one's dashboard and the guest's bank would: resend a webhook (a duplicate the
    // payment service must ignore) and dispute a charge.
    private static IResourceBuilder<ProjectResource> AddPaymentProvider(this IDistributedApplicationBuilder builder, Keys keys) =>
        builder.AddProject<Projects.Airbnb_PaymentProvider>("payment-provider", launchProfileName: "http")
            .WithEnvironment("Provider__ApiKey", keys.PaymentProvider)
            .WithEnvironment("Provider__WebhookSecret", keys.PaymentWebhook)
            .AsHttpApi()
            .WithAdminCommand("/events/resend-latest", "Resend the latest webhook", keys.PaymentProvider, keyHeader: "X-Api-Key", options: new HttpCommandOptions
            {
                Description = "Send the most recent webhook again, with the same event id: the payment service changes nothing",
                IconName = "ArrowRepeatAll",
            })
            // The booking id is a command argument: a field in the dashboard, or `aspire resource payment-provider dispute --bookingId "…"`.
            .WithAdminCommand("/disputes", "Dispute a payment", keys.PaymentProvider, commandName: "dispute", keyHeader: "X-Api-Key", options: new HttpCommandOptions
            {
                Description = "Play the guest's bank contesting a booking's succeeded charge",
                IconName = "Warning",
                Arguments = [new InteractionInput { Name = "bookingId", Label = "Booking id", InputType = InputType.Text, Required = true, MaxLength = 40 }],
                PrepareRequest = context =>
                {
                    context.Request.Content = JsonContent.Create(new { reference = context.Arguments.GetString("bookingId") });
                    return Task.CompletedTask;
                },
            });

    // services/chat: guests message hosts live over SignalR. MongoDB, two instances that reach each other's connections
    // through the Redis backplane, and the only service the browser talks to directly: through the gateway, with a
    // token the API signs (chat-token-key). The Next server starts conversations with chat-service-key.
    public static IResourceBuilder<ProjectResource> AddChat(this IDistributedApplicationBuilder builder, Infrastructure infra, Keys keys)
    {
        var db = infra.Mongo.AddDatabase("chatdb", "chat");
        return builder.AddProject<Projects.Airbnb_Chat>("chat", launchProfileName: "http")
            .WithReference(db).WaitFor(db)
            .WithReference(infra.Redis).WaitFor(infra.Redis)
            .WithEnvironment("Chat__ServiceKey", keys.ChatService)
            .WithEnvironment("Chat__TokenKey", keys.ChatToken)
            .WithReplicas(2)
            .AsHttpApi();
    }

    // The API gateway: one address for the services the browser reaches, routed by path (WebSockets included). Only
    // chat so far; the Next server keeps calling the API directly, since the API trusts only loopback proxies for
    // client IPs. Its Information logs carry full request URLs, and a browser's hub URL carries its chat token
    // (WebSockets take no headers), so it logs at Warning (all of it: the image has no appsettings.json, so every
    // category falls back to Default): no token reaches the console or dashboard. One Default, since Helm can't
    // address a variable named after a category with dots (Logging__LogLevel__Microsoft.AspNetCore).
    public static IResourceBuilder<YarpResource> AddGateway(this IDistributedApplicationBuilder builder, IResourceBuilder<ProjectResource> chat) =>
        builder.AddYarp("gateway")
            .WithConfiguration(yarp => yarp.AddRoute("/chat/{**catch-all}", chat).WithTransformPathRemovePrefix("/chat"))
            .WithEnvironment("Logging__LogLevel__Default", "Warning")
            .OnLocalClusterPort(LocalCluster.GatewayPort);

    // services/notifications: hears about bookings only through the broker and emails guests through Mailpit.
    // "Send due reminders now" sends every waiting review reminder without waiting for check-out, and "Broadcast a
    // message" shows a message on every open page (the frontend relays the service's Server-Sent Events).
    public static IResourceBuilder<ProjectResource> AddNotifications(this IDistributedApplicationBuilder builder, Infrastructure infra, Keys keys)
    {
        var db = infra.Postgres.AddDatabase("notificationsdb", "notifications");
        return builder.AddProject<Projects.Airbnb_Notifications>("notifications", launchProfileName: "http")
            .WithReference(db).WaitFor(db)
            .WithReference(infra.Messaging).WaitFor(infra.Messaging)
            .WithReference(infra.Mailpit).WaitFor(infra.Mailpit)
            .WithEnvironment("Notifications__AdminKey", keys.NotificationsAdmin)
            .AsHttpApi()
            .WithAdminCommand("/reminders/send-due", "Send due reminders now", keys.NotificationsAdmin, new HttpCommandOptions
            {
                Description = "Email every guest whose review reminder is still waiting, whatever their check-out date",
                IconName = "Mail",
            })
            // The message is a command argument: a field in the dashboard, or `aspire resource notifications broadcast --message "…"`.
            .WithAdminCommand("/broadcasts", "Broadcast a message", keys.NotificationsAdmin, commandName: "broadcast", options: new HttpCommandOptions
            {
                Description = "Show a message on every page open on the site, right away",
                IconName = "Megaphone",
                // The service's limit too (BroadcastEndpoints.MaxLength).
                Arguments = [new InteractionInput { Name = "message", Label = "Message", InputType = InputType.Text, Required = true, MaxLength = 500 }],
                PrepareRequest = context =>
                {
                    context.Request.Content = JsonContent.Create(new { text = context.Arguments.GetString("message") });
                    return Task.CompletedTask;
                },
            });
    }

    // services/assistant, the smart chat box: a local model on Ollama. The model downloads once into the data volume
    // (about 2 GB for the default); Assistant:Model swaps it, and Assistant:Gpu=true uses an NVIDIA GPU (it fails to
    // start without one). Open WebUI chats with the same models in the browser.
    public static IResourceBuilder<ProjectResource> AddAssistant(this IDistributedApplicationBuilder builder)
    {
        var ollama = builder.AddOllama("ollama")
            .WithOpenWebUI(ui => ui.WithLifetime(ContainerLifetime.Persistent).WithImageTag("v0.12.4"))
            .WithDataVolume()
            .WithLifetime(ContainerLifetime.Persistent);
        if (bool.TryParse(builder.Configuration["Assistant:Gpu"], out var useGpu) && useGpu)
        {
            ollama.WithGPUSupport();
        }
        var modelName = builder.Configuration["Assistant:Model"] ?? "qwen2.5:3b";
        var model = ollama.AddModel("assistant-model", modelName);
        // Aspire downloads the model under `aspire run`; in the cluster a Job asks Ollama to.
        ollama.PullsModelOnLocalCluster(modelName);

        var assistant = builder.AddProject<Projects.Airbnb_Assistant>("assistant", launchProfileName: "http")
            .WithReference(model).WaitFor(model)
            .AsHttpApi();
        // The cluster publisher renames ConnectionStrings__assistant-model to ConnectionStrings__assistant_model, which
        // the client doesn't read; it falls back to the Aspire:OllamaSharp section.
        if (builder.IsLocalCluster())
        {
            assistant.WithEnvironment("Aspire__OllamaSharp__Endpoint", ollama.GetEndpoint("http"))
                .WithEnvironment("Aspire__OllamaSharp__SelectedModel", modelName);
        }
        return assistant;
    }
}
