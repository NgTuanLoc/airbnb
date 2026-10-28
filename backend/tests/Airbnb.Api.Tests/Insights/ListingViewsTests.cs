using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Airbnb.Api.Tests.Infrastructure;
using Confluent.Kafka;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;

namespace Airbnb.Api.Tests.Insights;

// Views go through the real listing-views topic and the projection. One class, so these run one after another: they
// share the consumer group, and the rebuild test wipes every count.
public sealed class ListingViewsTests(InfrastructureFixture infrastructure)
{
    private const string AdminKey = "test-admin-key";
    private static readonly TimeSpan CountTimeout = TimeSpan.FromSeconds(45);

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string NewHostListingId() => $"hl-{Guid.NewGuid()}";

    private WebApplicationFactory<Program> Factory(bool projection = true, string? adminKey = AdminKey) =>
        new ApiFactory(infrastructure).WithWebHostBuilder(builder =>
        {
            builder
                .UseSetting("Insights:Projection:Enabled", projection ? "true" : "false")
                .UseSetting("RateLimiting:ViewsPerMinute", "1000");
            if (adminKey is not null)
            {
                builder.UseSetting("Insights:AdminKey", adminKey);
            }
        });

    private static async Task ViewAsync(HttpClient client, string listingId, int times = 1)
    {
        for (var i = 0; i < times; i++)
        {
            using var response = await client.PostAsync($"/api/listings/{listingId}/views", content: null, Ct);
            Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        }
    }

    private static async Task<JsonElement> ViewsAsync(HttpClient client, string listingId)
    {
        using var response = await client.GetAsync($"/api/listings/{listingId}/views", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("data");
    }

    // The projection is eventually consistent: poll until the count arrives.
    private static async Task WaitForViewsAsync(HttpClient client, string listingId, long expected)
    {
        var deadline = DateTime.UtcNow + CountTimeout;
        long last;
        do
        {
            last = (await ViewsAsync(client, listingId)).GetProperty("last7Days").GetInt64();
            if (last == expected)
            {
                return;
            }
            await Task.Delay(250, Ct);
        }
        while (DateTime.UtcNow < deadline);
        Assert.Fail($"Expected {expected} views of {listingId}, still {last} after {CountTimeout.TotalSeconds}s");
    }

    private static async Task<HttpResponseMessage> RebuildAsync(HttpClient client, string? key)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/insights/rebuild");
        if (key is not null)
        {
            request.Headers.Add("X-Admin-Key", key);
        }
        return await client.SendAsync(request, Ct);
    }

    [Fact]
    public async Task Views_are_counted_through_kafka()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var listing = NewHostListingId();

        await ViewAsync(client, listing, times: 3);

        await WaitForViewsAsync(client, listing, 3);
        var views = await ViewsAsync(client, listing);
        Assert.Equal(listing, views.GetProperty("listingId").GetString());
        Assert.Equal(0, views.GetProperty("previous7Days").GetInt64());
    }

    [Fact]
    public async Task Each_view_is_published_keyed_by_its_listing_and_carries_nothing_about_the_viewer()
    {
        await using var factory = Factory(projection: false);
        using var client = factory.CreateClient();
        var listing = NewHostListingId();

        await ViewAsync(client, listing);

        using var consumer = new ConsumerBuilder<string, string>(new ConsumerConfig
        {
            BootstrapServers = infrastructure.KafkaBootstrapAddress,
            GroupId = $"test-{Guid.NewGuid():N}",
            AutoOffsetReset = AutoOffsetReset.Earliest,
        }).Build();
        consumer.Subscribe("listing-views");
        var deadline = DateTime.UtcNow + CountTimeout;
        ConsumeResult<string, string>? found = null;
        while (found is null && DateTime.UtcNow < deadline)
        {
            var result = consumer.Consume(TimeSpan.FromMilliseconds(500));
            if (result?.Message.Key == listing)
            {
                found = result;
            }
        }
        consumer.Close();

        Assert.NotNull(found);
        // No headers either: a trace context would tie each view, forever, to the guest's request telemetry.
        Assert.True(found.Message.Headers is null || found.Message.Headers.Count == 0,
            $"Unexpected headers: {string.Join(", ", found.Message.Headers?.Select(h => h.Key) ?? [])}");
        var value = JsonDocument.Parse(found.Message.Value).RootElement;
        Assert.Equal(["listingId", "viewedAt"], value.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal(listing, value.GetProperty("listingId").GetString());
    }

    [Fact]
    public async Task Malformed_ids_are_404()
    {
        await using var factory = Factory(projection: false);
        using var client = factory.CreateClient();

        using var post = await client.PostAsync("/api/listings/not-a-listing/views", content: null, Ct);
        using var get = await client.GetAsync("/api/listings/not-a-listing/views", Ct);

        // The module's own 404, not the framework's for an unknown route.
        foreach (var response in new[] { post, get })
        {
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            var error = (await response.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("error").GetString();
            Assert.Equal("Listing 'not-a-listing' was not found", error);
        }
    }

    [Fact]
    public async Task Counts_survive_a_restart_without_double_counting()
    {
        var listing = NewHostListingId();
        await using (var first = Factory())
        {
            using var client = first.CreateClient();
            await ViewAsync(client, listing, times: 2);
            await WaitForViewsAsync(client, listing, 2);
        }

        await using var second = Factory();
        using var secondClient = second.CreateClient();
        await ViewAsync(secondClient, listing);

        await WaitForViewsAsync(secondClient, listing, 3);
        await Task.Delay(TimeSpan.FromSeconds(3), Ct);
        Assert.Equal(3, (await ViewsAsync(secondClient, listing)).GetProperty("last7Days").GetInt64());
    }

    [Fact]
    public async Task Rebuild_needs_the_admin_key_and_a_running_projection()
    {
        await using (var keyless = Factory(adminKey: null))
        {
            using var client = keyless.CreateClient();
            using var response = await RebuildAsync(client, AdminKey);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }

        await using (var keyed = Factory())
        {
            using var client = keyed.CreateClient();
            using var missing = await RebuildAsync(client, key: null);
            using var wrong = await RebuildAsync(client, "not-the-key");
            Assert.Equal(HttpStatusCode.Unauthorized, missing.StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        }

        await using var stopped = Factory(projection: false);
        using var stoppedClient = stopped.CreateClient();
        using var unavailable = await RebuildAsync(stoppedClient, AdminKey);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, unavailable.StatusCode);
    }

    [Fact]
    public async Task Rebuild_recounts_everything_from_the_log()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();
        var listing = NewHostListingId();
        await ViewAsync(client, listing, times: 2);
        await WaitForViewsAsync(client, listing, 2);
        // Tamper with the projection, so only a real replay of the log can put it right.
        var bogus = NewHostListingId();
        await ExecuteSqlAsync($"""
            UPDATE insights.listing_daily_views SET "Views" = 99 WHERE "ListingId" = '{listing}';
            INSERT INTO insights.listing_daily_views ("ListingId", "Day", "Views") VALUES ('{bogus}', current_date, 7);
            """);

        using var rebuild = await RebuildAsync(client, AdminKey);
        Assert.Equal(HttpStatusCode.Accepted, rebuild.StatusCode);
        await ViewAsync(client, listing);

        // 2 recounted from the log plus the new one: no rebuild would leave 100, losing the old views 1, counting them
        // twice 5; and the bogus row, never in the log, is gone.
        await WaitForViewsAsync(client, listing, 3);
        await Task.Delay(TimeSpan.FromSeconds(3), Ct);
        Assert.Equal(3, (await ViewsAsync(client, listing)).GetProperty("last7Days").GetInt64());
        Assert.Equal(0L, await ScalarAsync($"""SELECT count(*) FROM insights.listing_daily_views WHERE "ListingId" = '{bogus}'"""));
    }

    // Ids here are generated GUIDs, never user input.
    private async Task ExecuteSqlAsync(string sql)
    {
        await using var connection = new NpgsqlConnection(infrastructure.PostgresConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync(Ct);
    }

    private async Task<long> ScalarAsync(string sql)
    {
        await using var connection = new NpgsqlConnection(infrastructure.PostgresConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand(sql, connection);
        return (long)(await command.ExecuteScalarAsync(Ct))!;
    }
}
