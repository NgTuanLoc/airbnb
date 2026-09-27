using Airbnb.Api.Tests.Infrastructure;
using Airbnb.Modules.Reviews.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Wolverine;
using Wolverine.Configuration;
using Wolverine.Runtime;

namespace Airbnb.Api.Tests.Reviews;

// Pins the messaging topology the flow tests can't see: without the RabbitMQ route Wolverine would still deliver
// ReviewSubmitted locally in memory, and non-durable local handler queues would lose rating updates on a crash.
public sealed class ReviewMessagingTopologyTests(InfrastructureFixture infrastructure)
{
    [Fact]
    public async Task ReviewSubmitted_is_routed_only_to_the_rabbitmq_queue()
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        using var scope = factory.Services.CreateScope();
        var envelopes = scope.ServiceProvider.GetRequiredService<IMessageBus>()
            .PreviewSubscriptions(new ReviewSubmitted("r1", ReviewSubjectType.Stay, "l1", 5, DateTimeOffset.UtcNow));

        var envelope = Assert.Single(envelopes);
        Assert.Equal("rabbitmq://queue/reviews.review-submitted", envelope.Destination?.ToString());
    }

    [Theory]
    [InlineData("local://airbnb.api.messaging.staysreviewsubmittedhandler")]
    [InlineData("local://airbnb.api.messaging.experiencesreviewsubmittedhandler")]
    public async Task Each_separated_handler_queue_is_durable(string uri)
    {
        await using var factory = new ApiFactory(infrastructure);
        using var client = factory.CreateClient();

        var endpoints = factory.Services.GetRequiredService<IWolverineRuntime>().Options.Transports.AllEndpoints();

        var endpoint = Assert.Single(endpoints, endpoint => endpoint.Uri.ToString().TrimEnd('/') == uri);
        Assert.Equal(EndpointMode.Durable, endpoint.Mode);
    }
}
