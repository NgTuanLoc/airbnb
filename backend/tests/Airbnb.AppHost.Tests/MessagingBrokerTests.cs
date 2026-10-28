using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;

namespace Airbnb.AppHost.Tests;

// Messaging:Broker picks the AMQP broker Wolverine uses; the API only ever sees the "messaging" connection.
// These build the app model without starting anything.
public sealed class MessagingBrokerTests
{
    private static async Task<IResource> MessagingResourceAsync(params string[] args)
    {
        var ct = TestContext.Current.CancellationToken;
        var appHost = await DistributedApplicationTestingBuilder.CreateAsync<Projects.Airbnb_AppHost>(args, ct);
        return Assert.Single(appHost.Resources, r => r.Name == "messaging");
    }

    [Fact]
    public async Task LavinMQ_is_the_default()
    {
        Assert.IsType<LavinMQContainerResource>(await MessagingResourceAsync());
    }

    [Fact]
    public async Task RabbitMQ_is_one_setting_away()
    {
        Assert.IsType<RabbitMQServerResource>(await MessagingResourceAsync("--Messaging:Broker=RabbitMQ"));
    }

    [Fact]
    public async Task An_unknown_broker_fails_at_startup()
    {
        var exception = await Assert.ThrowsAnyAsync<Exception>(() => MessagingResourceAsync("--Messaging:Broker=Kafka"));
        Assert.Contains("Messaging:Broker", exception.ToString());
    }
}
