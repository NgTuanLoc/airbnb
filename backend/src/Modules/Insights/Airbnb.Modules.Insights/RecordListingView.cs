using Airbnb.SharedKernel;
using Confluent.Kafka;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Logging;

namespace Airbnb.Modules.Insights;

internal static class RecordListingView
{
    // Enqueues the view with the producer and answers at once: the page never waits for the broker, and a view lost
    // while Kafka is down only makes a count slightly low.
    internal static void Map(IEndpointRouteBuilder api) =>
        api.MapPost("/listings/{id}/views", Results<Accepted<ApiResponse<object>>, NotFound<ApiResponse<object>>> (
            string id, IProducer<string, string> producer, TimeProvider time, ILoggerFactory loggers) =>
        {
            if (!ListingIds.IsValid(id))
            {
                return TypedResults.NotFound(ApiResponse.Fail(GetListingViews.NotFound(id)));
            }

            var logger = loggers.CreateLogger(typeof(RecordListingView));
            var view = new ListingViewEvent(id, time.GetUtcNow());
            try
            {
                // Keyed by the listing, so all its views land on one partition, in order.
                producer.Produce(ListingViewsTopic.Name, new Message<string, string> { Key = id, Value = view.Serialize() }, report =>
                {
                    if (report.Error.IsError)
                    {
                        logger.LogWarning("A listing view wasn't delivered: {Reason}", report.Error.Reason);
                    }
                });
            }
            catch (KafkaException exception)
            {
                logger.LogWarning(exception, "A listing view couldn't be queued");
            }
            return TypedResults.Accepted((string?)null, new ApiResponse<object>(true));
        }).WithMetadata(RateLimitBucket.Views);
}
