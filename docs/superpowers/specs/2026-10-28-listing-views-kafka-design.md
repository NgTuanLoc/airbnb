# Listing views over Kafka: design

Date: 2026-10-28. Status: approved (the user asked for it to be built without further questions).

## Intent

The user wants Kafka in this project, and asked which use case fits best. Kafka was built at LinkedIn for activity
tracking: many small events that only matter once aggregated, kept in a durable log that any number of readers can
consume, and replay, at their own pace. Here that activity is **guests viewing listings**:

- every listing page shows guests how many times it was viewed in the past week, seed listings included;
- the host dashboard shows each of the host's listings its views for the last 7 days and the change from the week
  before;
- the counts are a projection of a Kafka topic that keeps every view forever, so they can be wiped and rebuilt from
  the log with one click, which is the part a queue like RabbitMQ can't do.

RabbitMQ keeps its job (review events: one handler, one job, reliably). Kafka is not a replacement for it.

## Goals

- `POST /api/listings/{id}/views` records one view; the API publishes it to the `listing-views` topic and answers 202.
- A projection in a new **Insights** module consumes the topic in batches and keeps daily counts per listing in
  Postgres, exactly once: counts and Kafka offsets are written in the same transaction.
- `GET /api/listings/{id}/views` returns `{ listingId, last7Days, previous7Days }`.
- Listing pages (`/rooms/[id]`) send the view from the browser, except to the listing's own host, and show
  "N views in the past week" when N > 0.
- `/host/listings` shows "N views in the last 7 days · ↑ X% vs. the week before" per listing.
- An Aspire dashboard command, **Rebuild view stats**, wipes the counts and recounts them from the start of the topic.
- Kafka and Kafka UI run under `aspire run` through Aspire's integrations; k6's guest scenario records views, so a
  load run puts real traffic through Kafka.

## Non-goals

- Unique visitors (refreshes count; small overcounts are fine for these stats), bot filtering, search events,
  "Trending" rows or "Rare find" badges (the natural second reader later: it would backfill itself from the topic).
- Moving reviews or bookings to Kafka; CDC (Debezium); a Kafka cluster with more than one broker.
- Stats in mock mode: the beacon is a no-op and no counts are shown.

## Anti-goals

- Personal data in the log. Events carry the listing id and the time only; a Kafka log can't easily be edited.
- A stats outage breaking a listing page or the host dashboard: counts are optional decoration.
- Double counting when the API restarts or the consumer group rebalances.

## Design

### Event and topic

- Topic `listing-views`, 3 partitions, replication factor 1, `retention.ms=-1` (kept forever: the log is the source of
  truth and the table is a view of it). Created by the API at startup, before it takes requests, if missing.
- Key: the listing id (all views of a listing land on one partition, in order). Value: JSON
  `{"listingId":"l3","viewedAt":"2026-10-28T09:15:00+00:00"}`; `viewedAt` is the API's clock, never the browser's.
- Listing ids are validated before anything is published: seed ids `l` + 1–6 digits, host listings `hl-` + a GUID
  (`^(l[0-9]{1,6}|hl-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`). Anything else is a 404. The API
  can't check host listings exist (they live in the Next server), so the pattern and the rate limit bound the junk.

### Producer

Aspire's client integration `Aspire.Confluent.Kafka` (`AddKafkaProducer<string, string>("kafka")`), idempotent
producer, tracing off (no `traceparent` header on records kept forever). The endpoint enqueues with `Produce` (no await
on the broker) and returns 202; delivery failures are logged. A view lost while Kafka is down is acceptable.

### Projection (exactly once into Postgres)

`ListingViewsProjection`, a `BackgroundService` in the Insights module, using Aspire's `AddKafkaConsumer<string,
string>` (group `insights-listing-views`, auto-commit off, `AutoOffsetReset=Earliest`):

- **Offsets live in Postgres.** Table `insights.consumer_offsets (Topic, Partition, NextOffset)`. The
  partitions-assigned handler starts each partition at its stored offset, or at the beginning when there is none; it
  retries that read until the database answers (nothing can be consumed without it).
- **Nothing is written twice from memory.** A write that reports a failure may still have landed, so a failed batch
  is dropped and every owned partition rewound to its stored offset before reading on: the stored offsets say what
  was written.
- **Batches.** Consume up to 500 messages or 1 second (flush early when the topic goes quiet), aggregate to
  `(listingId, day) → count`, then one transaction: upsert `insights.listing_daily_views (ListingId, Day, Views)`
  adding the counts, and upsert the next offsets. After the commit: commit the offsets to Kafka too (best effort, so
  Kafka UI shows the group's lag) and invalidate the module's HybridCache tag.
- **Rebalances.** The partitions-revoked handler flushes the pending batch before the partitions move, so the next
  owner starts after it. The consumer is closed (leaving the group) when the host stops.
- A malformed message is skipped but its offset still advances.
- `Insights:Projection:Enabled` (default true) turns the projection off; integration tests other than the Insights
  ones run with it off, so dozens of test hosts don't all join the group.

### Rebuild

`POST /api/insights/rebuild` with header `X-Admin-Key` = `Insights:AdminKey` (fixed-time compare; 404 when no key is
configured, 401 on a wrong key, 503 when the projection isn't running, else 202). It asks the projection loop, which
does the work between batches on its own thread: delete all counts and stored offsets in one transaction (asked for
again if it fails; wiping twice is harmless), invalidate the cache, drop the pending batch, and rewind every owned
partition to its stored offset, which is now the beginning (partitions assigned later start there anyway). The AppHost
exposes it as the **Rebuild view stats** command on the `api` resource (generated secret parameter
`insights-admin-key`). Single API instance only: with replicas, each instance's wipe would delete what the others had
already replayed, so a rebuild would need a coordinated stop first.

### Reads

`GET /api/listings/{id}/views`: ≤ 14 daily rows for the listing, summed in C#: `last7Days` = today and the 6 days
before (UTC), `previous7Days` = the 7 days before those. Cached through HybridCache (key
`insights:listing-views:{id}`, tag `insights`), invalidated after every applied batch.

### Rate limiting

View pings are writes but must not spend the 10 writes/min budget. Endpoints can carry `RateLimitBucket` metadata
(SharedKernel); `ApiRateLimiting` gives the `views` bucket its own per-IP limit, `RateLimiting:ViewsPerMinute`
(default 120). Under `aspire run` the AppHost raises it to 100,000 like reads, because k6 shares one IP.

### AppHost

`AddKafka("kafka").WithKafkaUI().WithDataVolume()`, persistent, so the log outlives runs and a rebuild has history;
the API references and waits for it. The k6 guest scenario posts a view for each listing it opens.

### Frontend

- `lib/api/relay.ts` (moved from `lib/host/photo-relay.ts`) gains `session: false`, used by the public image proxy and
  the view relay, so a viewer's session token isn't forwarded where it isn't needed.
- `POST /api/listings/[id]/views` (route handler): 204 in mock mode, 404 for a malformed id, else relays to the API
  with the browser IP.
- `ListingViewBeacon` (client component): posts once per page view (`fetch` with `keepalive`; a ref guards against
  React strict mode running effects twice), errors ignored. The room page renders it unless the viewer is the host.
- `listingViews.weekly(id)` repository: `null` in mock mode; in api mode the backend's numbers, or `null` (logged) when
  the call fails.
- Copy (`lib/insights/views.ts`):
  - guests: "1 view in the past week" / "48 views in the past week"; nothing when 0;
  - hosts: "No views in the last 7 days", "1 view in the last 7 days", "132 views in the last 7 days · ↑ 18% vs. the
    week before", "↓ 5% …", "· same as the week before"; no comparison when the week before had 0.

## Testing

- Unit: id pattern, batch aggregation and next offsets, weekly windows, copy.
- Integration (`Airbnb.Api.Tests`, Kafka Testcontainer `confluentinc/cp-kafka` in KRaft mode): views are counted
  through Kafka; bad ids are 404; counts survive an API restart without double counting; rebuild recounts from the log
  and is guarded by the key; views have their own rate-limit budget.
- AppHost smoke test: a view for `l16` shows up in its counts.
- Frontend: relay, view route, beacon (once under strict mode), repository, room page and host dashboard lines.

## Calls made without asking

- Guest-facing counts say "views", not "people", because views aren't deduplicated.
- The Confluent client (through Aspire's integration) instead of Wolverine's Kafka transport: Wolverine hides offsets
  and partitions, and the exactly-once projection and the rebuild need them.
- Topic retention forever, 3 partitions, batches of 500 / 1 s, rebuild by seeking the owned partitions to the start
  (an unsubscribe + subscribe in a row may not rebalance at all).
- Views of an in-memory host listing keep their rows after the Next server restarts; they are never shown again.
