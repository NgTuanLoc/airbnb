# Payment Webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the payment service's in-process `FakeProcessor` with a fake payment provider that reports outcomes by signed webhook, and push each outcome to Bookings over the broker.

**Architecture:** A new ASP.NET Core app in the payments solution plays the provider (in memory, Stripe-shaped events and signatures). The payment service calls it over HTTP, verifies its webhooks, settles payments in one outbox transaction that also publishes `payment-succeeded` / `payment-declined` to the `payments` fanout exchange, and the monolith's Bookings consumes those events. The API's reconciler stays as the backup, recovering lost webhooks through reconcile-on-read.

**Tech Stack:** .NET 10, ASP.NET Core minimal APIs, Wolverine 6.40 (RabbitMQ transport, EF Core outbox, durable local queues), EF Core 10 + Npgsql, Aspire 13.6 AppHost, xUnit v3 on Microsoft Testing Platform, Testcontainers (Postgres, LavinMQ), Next.js 16 + Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-payment-webhooks-design.md`

## Global Constraints

- Provider resource `payment-provider`; project `services/payments/src/Airbnb.PaymentProvider`, tests `services/payments/tests/Airbnb.PaymentProvider.Tests`; both in `Airbnb.Payments.slnx`.
- Provider settings: `Provider:ApiKey`, `Provider:WebhookUrl`, `Provider:WebhookSecret` (required at startup), `Provider:SlowCardDelay` (default `00:00:10`), `Provider:WebhookRetryDelay` (default `00:00:01`).
- Payment service settings: `Payments:ProviderKey`, `Payments:WebhookSecret` (required at startup), `Payments:ProviderAttemptTimeout` (default `00:00:02`; a test knob, not in the spec). `Payments:SlowCardDelay` goes.
- Headers: `X-Api-Key` (provider API), `Provider-Signature: t=<unix seconds>,v1=<lowercase hex HMAC-SHA256 of "<t>.<raw body>">`, `X-Service-Key` unchanged.
- Signature tolerance 5 minutes; any `v1` may match; constant-time compare. Webhook body cap 64 KB → 413.
- Event JSON (camelCase): `{ id: "evt_…", type, created, data: { object: { id, reference, amount, currency, status, declineReason } } }`; types `charge.succeeded`, `charge.failed`, `charge.refunded`, `charge.dispute.created`.
- Delivery retries: `WebhookRetryDelay` × 1, 5, 25, 125, 625; 6 attempts; re-signed per attempt.
- Broker: fanout exchange `payments`; identities `payment-succeeded { bookingId }`, `payment-declined { bookingId, declineReason }`; the API's queue `bookings.payments` (durable inbox).
- Payment statuses: `processing`, `succeeded`, `declined`, `voided`, `refunded`, `disputed`.
- AppHost keys `payment-provider-key`, `payment-webhook-secret` (`AddGeneratedKey`).
- `PaymentReconciler` default interval 2 minutes. Refresh-on-read 2 s at most. `RefreshWhilePending`: every 3 s, at most 2 minutes.
- Card numbers and CVCs are never stored, logged or put in an event. No real secrets in the repo (tests use literal `test-…` keys, as today).
- Repo rules: package versions only in each solution's `Directory.Packages.props`; warnings are errors; xUnit tests pass `TestContext.Current.CancellationToken`; Wolverine handler types public; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A webhook body formatted unlike a serializer's output (extra spaces, other key order) must still verify: the signature covers the raw bytes. Test in Task 3: `A_body_with_unusual_formatting_still_verifies`.
- A delivery retried for longer than the 5-minute tolerance must still be accepted: each attempt is signed afresh. Test in Task 1: `Failed_deliveries_are_retried_until_delivered` asserts every attempt's signature verifies and its `t` never decreases.
- The webhook can land before the charge's own answer is applied: the charge request must still answer 201 from the stored row, and only one `payment-succeeded` goes out. Test in Task 2: `A_webhook_that_lands_before_the_answer_still_gives_201_and_one_event`.
- A body over 64 KB sent without Content-Length (chunked) must still be refused with 413. Test in Task 3: `Oversized_webhooks_are_413_even_when_chunked`.
- A booking that stays pending (mock mode has no settlement; a provider can stay silent) must stop being refreshed after 2 minutes. Test in Task 7: `stops_after_two_minutes`.

---

### Task 1: The fake payment provider

**Files:**
- Create: `services/payments/src/Airbnb.PaymentProvider/Airbnb.PaymentProvider.csproj` (Web SDK; `Microsoft.AspNetCore.OpenApi`, `Scalar.AspNetCore`; `ProjectReference` to `backend/src/Airbnb.ServiceDefaults`; `InternalsVisibleTo` the tests), `Properties/launchSettings.json` (profile `http`, `http://localhost:5297`, Development), `Program.cs`, `ProviderSettings.cs`, `Charges.cs` (store, test-card rules, the one lock), `Webhooks.cs` (event, signing, delivery, resend), `ProviderEndpoints.cs`
- Create: `services/payments/tests/Airbnb.PaymentProvider.Tests/Airbnb.PaymentProvider.Tests.csproj` (same packages as `Airbnb.Payments.Tests` minus Testcontainers), `ProviderApp.cs` (factory + `WebhookInbox`), `ChargeTests.cs`, `WebhookTests.cs`
- Modify: `services/payments/Airbnb.Payments.slnx`

**Interfaces:**
- Produces (HTTP, used by Task 2's `ProviderClient` and Task 6's commands): the provider API exactly as in the spec's "Fake provider" section, under header `X-Api-Key`.
- Produces: `Webhooks.Sign(ReadOnlySpan<byte> body, string secret, long timestamp) -> string` (the header value), `Webhooks.ClientName = "webhooks"`, `Webhooks.SignatureHeader = "Provider-Signature"`.

- [ ] **Step 1: Write the failing tests.** `ProviderApp` builds a `WebApplicationFactory<Program>` per test with `Provider:ApiKey=test-api-key`, `Provider:WebhookUrl=http://payments.test/webhooks/provider`, `Provider:WebhookSecret=test-webhook-secret`, `Provider:SlowCardDelay=00:00:00.3`, `Provider:WebhookRetryDelay=00:00:00.05`, and swaps the `webhooks` client's primary handler for a `WebhookInbox` (records each request's body bytes and signature header; `FailFirst(int n)` answers 500 to the first n). Tests (`[Theory]` where listed):
  - `Test_cards_decide_the_charge`: `4242424242424242` → `succeeded`; `5555555555554444` → `succeeded`; `4000000000000002` → `declined`/`card_declined`; `4000000000009995` → `declined`/`insufficient_funds`.
  - `Each_settled_charge_sends_one_signed_webhook`: one delivery, type `charge.succeeded`, `data.object.reference` = the reference, the header verifies with `test-webhook-secret`, and the body contains neither the card number nor the CVC.
  - `The_same_reference_returns_the_same_charge` (same `id`, one webhook) and `A_different_amount_is_409` (`idempotency_conflict`).
  - `The_flaky_card_fails_twice_then_succeeds`: `4000000000000119` → 500 `processing_error`, 500, then 200 `succeeded`; `GET /charges/{ref}` is 404 after the first two.
  - `The_slow_card_is_processing_then_succeeds_by_webhook`: `4000000000000077` → 200 `processing`, no delivery yet; within 5 s a `charge.succeeded` delivery and `GET` → `succeeded`.
  - `Failed_deliveries_are_retried_until_delivered`: `FailFirst(2)` → 3 attempts of the same event id; each attempt's signature verifies and its `t` is ≥ the previous one's.
  - `Refund_rules`: succeeded → 200 `refunded` + `charge.refunded`; again → 200 `refunded`, no new delivery; processing → 409 `charge_processing`; declined → 200 `declined`; unknown → 404.
  - `Disputes_mark_only_succeeded_charges`: succeeded → 200 `disputed` + `charge.dispute.created`; declined → 409; unknown → 404.
  - `Resend_repeats_the_latest_event`: after one charge, `POST /events/resend-latest` → 200, and a second delivery carries the same event id; on a fresh app → 404.
  - `Requests_need_the_api_key`: no key and a wrong key → 401 on each endpoint; `/health` stays open.
  - `Bad_charge_requests_are_400`: no reference, a 41-character reference, amount 0, no card number → 400 `invalid_request`.
  - `Missing_settings_fail_at_startup`: empty `Provider:WebhookSecret` → `CreateClient()` throws.
- [ ] **Step 2: Run them to verify they fail.** Run (from `services/payments`): `dotnet test --project tests/Airbnb.PaymentProvider.Tests`. Expected: build errors (no provider project yet).
- [ ] **Step 3: Implement the provider.** As the spec's "Fake provider" section. `ProviderSettings.From(IConfiguration)` throws `InvalidOperationException` naming the missing key. `Charges` holds a `Dictionary<string, Charge>` and the flaky-card attempt counts behind one `Lock`, with a `// ponytail:` comment naming the ceiling (one lock, in memory: a restart loses charges and pending deliveries). Events are sent after the lock is released. The slow settle and each delivery run as background tasks on `IHostApplicationLifetime.ApplicationStopping`, waiting with `Task.Delay(delay, TimeProvider, token)`; a delivery logs each failed attempt (event id, type, attempt, status) and an error when it gives up. Charge ids `ch_<guid N>`, event ids `evt_<guid N>`. Keep the most recent 100 events for resend.
- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: all pass.
- [ ] **Step 5: Commit** `feat: a fake payment provider that reports charges by signed webhook`.

### Task 2: The payment service charges through the provider and announces outcomes

**Files:**
- Create: `services/payments/src/Airbnb.Payments/Provider/ProviderClient.cs`, `Data/Settlement.cs`, `Contracts/PaymentEvents.cs`
- Modify: `src/Airbnb.Payments/Program.cs`, `Api/PaymentEndpoints.cs`
- Delete: `src/Airbnb.Payments/Cards/FakeProcessor.cs`, `tests/Airbnb.Payments.Tests/FakeProcessorTests.cs`
- Test: create `tests/Airbnb.Payments.Tests/Integration/FakeProvider.cs` and `Integration/PaymentEventsListener.cs`; modify `Integration/PaymentsFixture.cs`, `Integration/PaymentsApiTests.cs`

**Interfaces:**
- Consumes: the provider HTTP API (Task 1).
- Produces: `ProviderClient` (public, singleton; `Name = "payment-provider"`):
  - `Task<ChargeAnswer> ChargeAsync(string reference, decimal amount, string currency, CardInput card)`: no cancellation token (a sent charge is followed through).
  - `Task<ProviderCharge?> FindAsync(string reference, CancellationToken)`: null on 404, throws on anything else.
  - `Task RefundAsync(string reference, CancellationToken)`: returns on 200/404, throws `HttpRequestException` otherwise.
  - `sealed record ProviderCharge(string Reference, string Status, string? DeclineReason)`; `enum ChargeAnswerKind { Charged, Refused, NoAnswer }`; `sealed record ChargeAnswer(ChargeAnswerKind Kind, ProviderCharge? Charge = null)`.
- Produces: `Settlement.TrySettleAsync(IDbContextOutbox<PaymentsDbContext> outbox, string bookingId, string status, string? declineReason, DateTimeOffset now, CancellationToken) -> Task<bool>`. It opens a transaction unless one is open, moves the payment from `processing` to `status` (a conditional `ExecuteUpdateAsync`), publishes the matching event when it moved, and commits with `SaveChangesAndFlushMessagesAsync`. True when this call moved it.
- Produces: `[MessageIdentity("payment-succeeded")] public sealed record PaymentSucceeded(string BookingId)` and `[MessageIdentity("payment-declined")] public sealed record PaymentDeclined(string BookingId, string? DeclineReason)` (namespace `Airbnb.Payments.Contracts`).

- [ ] **Step 1: Write the failing tests.**
  - `FakeProvider` (an `HttpMessageHandler` swapped in as the `payment-provider` client's primary handler; checks `X-Api-Key` = `PaymentsFixture.ProviderKey`) answers like the provider by card: `4242…` succeeded, `…0002`/`…9995` declined, `…0077` processing, `…0119` 500 twice per reference, plus fake-only cards: `4000000000000341` never answers (waits on the request's token), `4000000000003220` answers `succeeded` after 1 s, `4000000000000101` → 400. It records requests per reference, and has `Settle(reference, status)` and an optional `BeforeAnswer` hook (`Func<string, Task>`).
  - `PaymentEventsListener.StartAsync(connectionString)`: declares the `payments` fanout exchange and binds an exclusive queue. `EventsForAsync(bookingId, expected, timeout)` returns `(Type, Body)` pairs, like the API tests' `BookingEventsTests.Listener`.
  - Fixture settings: `Payments:ProviderKey=test-provider-key`, `Payments:WebhookSecret=test-webhook-secret`, `Payments:ProviderAttemptTimeout=00:00:00.2`; drop `Payments:SlowCardDelay`.
  - Tests:
    - `A_good_card_is_charged_and_announced`: 201, brand/last4 as today, exactly one `payment-succeeded` with `bookingId`.
    - `Declined_cards_answer_402_and_are_announced`: the existing theory, plus one `payment-declined` with the reason.
    - `A_processing_charge_answers_202`: `…0077` → 202 with status `processing`; no event within 1 s.
    - `The_flaky_card_is_retried_with_the_same_reference`: 201; the fake saw 3 requests for that reference. Replaces `Processor_error_answers_503_then_succeeds`.
    - `No_answer_leaves_it_processing`: `…0341` → 202 `processing`.
    - `A_refused_charge_is_503_and_released`: `…0101` → 503 `processor_error`; `GET` → 404.
    - `Concurrent_charges_of_one_booking_charge_once`: `…3220` twice at once → one 201 and one 202 (or 201), one row, and one request at the fake.
    - `A_charge_the_caller_gave_up_on_still_finishes`: `…3220`, caller cancels at 300 ms → status `succeeded` within 10 s.
    - `A_webhook_that_lands_before_the_answer_still_gives_201_and_one_event`: `BeforeAnswer` settles the payment through `Settlement.TrySettleAsync` in a fresh scope (Task 3 switches it to a signed webhook post) → 201 and exactly one `payment-succeeded`.
    - `Missing_provider_settings_fail_at_startup`: empty `Payments:ProviderKey` → `CreateClient()` throws.
  - The other existing tests stay as they are.
- [ ] **Step 2: Run them to verify they fail.** Run: `dotnet test --project tests/Airbnb.Payments.Tests`. Expected: compile errors, then failures.
- [ ] **Step 3: Implement.**
  - `ProviderClient`: 3 attempts, `Payments:ProviderAttemptTimeout` each, backoff 200 ms × attempt.
    - 200 → `Charged`.
    - 400/401/403/409 → `Refused` (logged as an error).
    - 5xx, timeout or connection failure → retry, then `NoAnswer`.
    - An unreadable body counts as `NoAnswer`.
  - Charge endpoint, per the spec's "Payment service" bullets: settle on `succeeded`/`declined`; `Refused` releases the claim (delete where `processing`) → 503 `processor_error`; otherwise the stored row. `Outcome` maps `processing` → 202 with the DTO.
  - `Program.cs`:
    - Register the named client at `https+http://payment-provider` (`[SuppressMessage("Sonar", "S1075", …)]` as `BookingsModule` does) and `ProviderClient`.
    - Throw at startup when either key is empty.
    - Wolverine: `UseEntityFrameworkCoreTransactions()`, then `PublishMessage<PaymentSucceeded>()` and `PublishMessage<PaymentDeclined>()` `.ToRabbitExchange("payments", e => e.ExchangeType = ExchangeType.Fanout).UseDurableOutbox()`.
- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: all pass.
- [ ] **Step 5: Commit** `feat: the payment service charges through the provider and announces outcomes`.

### Task 3: Receive the provider's webhooks

**Files:**
- Create: `services/payments/src/Airbnb.Payments/Webhooks/WebhookSignature.cs`, `Webhooks/WebhookEndpoint.cs`, migration `Data/Migrations/*_WebhookEvents.cs` (generated)
- Modify: `Data/PaymentsDbContext.cs` (status `Disputed`; entity `WebhookEvent { EventId (PK, ≤ 64), Type (≤ 64), ReceivedAt }`, table `webhook_events`; `TryRecordEventAsync(string eventId, string type, DateTimeOffset now, CancellationToken) -> Task<bool>` with `INSERT … ON CONFLICT DO NOTHING`), `Program.cs` (`app.MapProviderWebhooks()`)
- Test: create `tests/Airbnb.Payments.Tests/WebhookSignatureTests.cs`, `Integration/WebhookTests.cs`, `Integration/Webhook.cs` (builds and signs an event body; posts it)

**Interfaces:**
- Consumes: `Settlement.TrySettleAsync` (Task 2).
- Produces: `WebhookSignature.IsValid(string? header, ReadOnlySpan<byte> body, string secret, DateTimeOffset now) -> bool`, `WebhookSignature.Tolerance = 5 minutes`. `POST /webhooks/provider` as in the spec.

- [ ] **Step 1: Write the failing tests.**
  - `WebhookSignatureTests`: valid; body changed by one byte; wrong secret; `t` 6 minutes old; `t` 6 minutes ahead; malformed header (no `t`, no `v1`, non-hex `v1`); two `v1` entries of which the second is right → valid.
  - `WebhookTests`, through the fixture's client with no service key:
    - `A_signed_success_settles_a_processing_payment_once`: `…0077`, then `charge.succeeded` → 200, `succeeded`, one `payment-succeeded`; the same event again → 200, still one event after 1 s, one `webhook_events` row.
    - `A_failure_event_declines_with_its_reason`: `charge.failed` with `insufficient_funds` → `declined` + `payment-declined` with that reason.
    - `Refund_and_dispute_events_move_a_succeeded_payment`.
    - `Late_or_out_of_order_events_change_nothing`: `charge.failed` for a succeeded payment → stays `succeeded`, no `payment-declined`.
    - `Unsigned_tampered_or_stale_webhooks_are_400`: `invalid_signature`; the status is unchanged.
    - `A_body_with_unusual_formatting_still_verifies`: hand-written JSON with extra spaces and reordered keys.
    - `Oversized_webhooks_are_413_even_when_chunked`: 65 KB, once with Content-Length and once as a stream without one.
    - `Unparsable_bodies_are_400`.
    - `Unknown_event_types_are_acknowledged`.
  - Switch Task 2's `A_webhook_that_lands_before_the_answer…` `BeforeAnswer` hook to post a signed `charge.succeeded`.
- [ ] **Step 2: Run them to verify they fail.** `dotnet test --project tests/Airbnb.Payments.Tests`. Expected: compile errors.
- [ ] **Step 3: Implement.**
  - The endpoint reads the raw body into a buffer capped at 64 KB (413 past the cap, whatever the Content-Length says), verifies before parsing, then runs the spec's one-transaction flow.
  - `charge.refunded` / `charge.dispute.created` are conditional updates from `succeeded`, committed with `SaveChangesAndFlushMessagesAsync`.
  - A dispute logs a warning with the booking id.
  - Generate the migration from `backend/` with the pinned tool: `dotnet tool restore`, then `dotnet tool run dotnet-ef migrations add WebhookEvents --project ../services/payments/src/Airbnb.Payments --startup-project ../services/payments/src/Airbnb.Payments --output-dir Data/Migrations`.
- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: all pass.
- [ ] **Step 5: Commit** `feat: the payment service verifies and applies the provider's webhooks`.

### Task 4: Refresh on read, and voids and refunds at the provider

**Files:**
- Create: `services/payments/src/Airbnb.Payments/Handlers/Refunds.cs`, which replaces `Handlers/RefundOnCancel.cs`. It holds `public sealed record RefundPayment(string BookingId)` and the handlers `Handle(BookingCancelled, …)` and `Handle(RefundPayment, …)`; both call the provider's refund, then mark the payment `refunded` where it was `succeeded`.
- Modify: `Api/PaymentEndpoints.cs` (GET refresh; void plus `RefundPayment` in one transaction through `IDbContextOutbox<PaymentsDbContext>`), `Program.cs` (`options.Policies.UseDurableLocalQueues()`)
- Test: modify `Integration/FakeProvider.cs` (refund handling: 409 while `processing`, records refund attempts), `Integration/PaymentsApiTests.cs`

**Interfaces:**
- Consumes: `ProviderClient.FindAsync` / `RefundAsync`, `Settlement.TrySettleAsync`.

- [ ] **Step 1: Write the failing tests.**
  - `Reading_a_processing_payment_asks_the_provider`: `…0077`; `provider.Settle(ref, "succeeded")`; `GET` → `succeeded`, and one `payment-succeeded`.
  - `A_silent_provider_leaves_the_read_as_stored`: the fake stops answering `GET`s for the reference; `GET` → `processing` in under 3 s.
  - `Voiding_refunds_at_the_provider`: `4242…`, void → `voided`, and the fake records a refund within 10 s.
  - `Voiding_a_processing_charge_refunds_once_it_settles`: `…0077`, void → the fake answers 409 to the first refund attempt; then `Settle(ref, "succeeded")` → a later attempt refunds it within 15 s, after at least 2 attempts.
  - `Booking_cancelled_refunds_at_the_provider` (replaces `Booking_cancelled_refunds_once`): the event twice → `refunded`, and the fake's charge is `refunded`.
- [ ] **Step 2: Run them to verify they fail.** `dotnet test --project tests/Airbnb.Payments.Tests`. Expected: the new tests fail.
- [ ] **Step 3: Implement**, as the spec's GET, void and refund bullets. The refresh uses a 2 s `CancellationTokenSource`; any failure keeps the stored row.
- [ ] **Step 4: Run the whole suite to verify it passes.** Expected: all pass.
- [ ] **Step 5: Commit** `feat: reconcile on read, and void and refund at the provider`.

### Task 5: Bookings settles from the payment events

**Files:**
- Create: `backend/src/Modules/Bookings/Airbnb.Modules.Bookings.Contracts/IBookingPayments.cs`, `backend/src/Modules/Bookings/Airbnb.Modules.Bookings/Integration/BookingPayments.cs`, `backend/src/Airbnb.Api/Messaging/PaymentOutcomeHandlers.cs` (the two records with the spec's identities, plus `PaymentSucceededHandler` / `PaymentDeclinedHandler`)
- Modify: `Airbnb.Modules.Bookings/BookingsModule.cs` (scoped registration), `Payments/PaymentsClient.cs` (202 → `Unknown`, no warning), `Payments/PaymentReconciler.cs` (default 2 minutes; `"succeeded" or "disputed"` confirm), `backend/src/Airbnb.Api/Program.cs` (`ListenToRabbitQueue("bookings.payments", q => q.BindExchange("payments")).UseDurableInbox()`, `AlwaysUseServiceLocationFor<IBookingPayments>()`)
- Test: create `backend/tests/Airbnb.Api.Tests/Bookings/PaymentEventsTests.cs`; modify `Infrastructure/FakePaymentService.cs` (card `Processing = "4000000000003220"` answers 202 `{ bookingId, status: "processing" }`), `Bookings/PaymentFlowTests.cs`

**Interfaces:**
- Produces: `public interface IBookingPayments { Task SettleAsync(string bookingId, bool paid, CancellationToken cancellationToken); }`.

- [ ] **Step 1: Write the failing tests.**
  - `PaymentFlowTests.A_processing_answer_is_202_pending_without_retries`: 202, `pending`, one attempt.
  - `PaymentEventsTests`:
    - `Payment_succeeded_confirms_a_pending_booking_once`: a pending booking (`Processing` card), the event published twice to the `payments` exchange (AMQP type = identity, camelCase JSON, persistent) → `confirmed` within 15 s, and exactly one `booking-confirmed` (the `BookingEventsTests.Listener`).
    - `Payment_declined_declines_a_pending_booking`: `declined`, no `booking-confirmed`.
    - `Events_for_settled_bookings_change_nothing`: a confirmed booking plus `payment-declined` → still `confirmed` after 2 s.
- [ ] **Step 2: Run them to verify they fail.** From `backend/`: `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Bookings.PaymentEventsTests"` (and `PaymentFlowTests`). Expected: compile errors, then failures.
- [ ] **Step 3: Implement.** `BookingPayments` loads the booking where it is `pending` through `IDbContextOutbox<BookingsDbContext>` and calls `PaymentOutcomes.ConfirmAsync` / `DeclineAsync`; otherwise it does nothing.
- [ ] **Step 4: Run them to verify they pass**, then the whole `Airbnb.Api.Tests`, `Airbnb.UnitTests` and `Airbnb.ArchitectureTests`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: bookings settle from the payment service's events`.

### Task 6: AppHost wiring and the smoke test

**Files:**
- Modify: `backend/src/Airbnb.AppHost/Services.cs` (`Keys` gains `PaymentProvider` = `payment-provider-key` and `PaymentWebhook` = `payment-webhook-secret`; `AddPayments` adds the provider and its two commands), `Conventions.cs` (`WithAdminCommand(…, string keyHeader = "X-Admin-Key")`), `Airbnb.AppHost.csproj` (a `ProjectReference` to the provider), `AppHost.cs` (header comment)
- Test: modify `backend/tests/Airbnb.AppHost.Tests/AppHostSmokeTests.cs`

**Interfaces:**
- Consumes: the provider's `/events/resend-latest` and `/disputes` (Task 1); the payment service's settings (Tasks 2–3).

- [ ] **Step 1: Write the failing smoke step.** `A_slow_card_is_confirmed_by_the_providers_webhook`: book l14 with `4000000000000077` → 202; poll `GET /api/bookings/{id}` with the guest's token until `confirmed` (60 s). `BookL14Async` also returns the token.
- [ ] **Step 2: Implement the wiring, per the spec's AppHost section.**
  - The provider: `AddProject<Projects.Airbnb_PaymentProvider>("payment-provider", launchProfileName: "http")` with `Provider__ApiKey` and `Provider__WebhookSecret`, then `.AsHttpApi()`.
  - The payment service: `.WithReference(provider).WaitFor(provider)`, plus `Payments__ProviderKey` and `Payments__WebhookSecret`.
  - Back on the provider: `Provider__WebhookUrl` = `ReferenceExpression.Create($"{payments.GetEndpoint("http")}/webhooks/provider")`.
  - Commands:
    - **Resend the latest webhook** (`/events/resend-latest`, icon `ArrowRepeatAll`).
    - **Dispute a payment** (`/disputes`; a required `bookingId` argument labelled "Booking id", posted as `{ reference }`; icon `Warning`).
    - Both use `keyHeader: "X-Api-Key"`.
- [ ] **Step 3: Verify.**
  - `dotnet build src/Airbnb.AppHost` passes.
  - `dotnet test --project tests/Airbnb.AppHost.Tests` passes; it needs Docker and its ports free.
  - `aspire publish -o <scratchpad>/chart` from `src/Airbnb.AppHost` renders a `payment-provider` Deployment and the webhook URL.
- [ ] **Step 4: Commit** `feat: run the payment provider in the AppHost, with resend and dispute commands`.

### Task 7: The trip page refreshes while pending

**Files:**
- Create: `frontend/components/features/bookings/refresh-while-pending.tsx`, `refresh-while-pending.test.tsx`
- Modify: `frontend/app/trips/[id]/page.tsx` (render `<RefreshWhilePending />` when `booking.status === "pending"`; the status line becomes `<output className="block text-body-sm text-muted">`), `frontend/app/trips/[id]/page.test.tsx`

**Interfaces:**
- Produces: `RefreshWhilePending(props: Readonly<{ intervalMs?: number; maxMs?: number }>)`, defaults 3000 and 120000; it renders nothing.

- [ ] **Step 1: Write the failing tests.**
  - `refresh-while-pending.test.tsx` (fake timers; `next/navigation` mocked as in `cancel-trip-button.test.tsx`):
    - `refreshes every three seconds`: 1 call at 3 s, 2 at 6 s.
    - `stops_after_two_minutes`: no further call after 120 s.
    - `stops when unmounted`.
  - `page.test.tsx`: a booking made with the slow card `4000000000000077` (mock mode keeps it pending) renders the refresher (mocked to a marker) and `role="status"` with "Payment processing"; a confirmed one doesn't render the refresher.
- [ ] **Step 2: Run them to verify they fail.** From `frontend/`: `npx vitest run components/features/bookings/refresh-while-pending.test.tsx app/trips`. Expected: fail.
- [ ] **Step 3: Implement** with one `setInterval`, cleared at the cap and on unmount.
- [ ] **Step 4: Verify.** The same tests pass; then `npm run lint`, `npx tsc --noEmit`, `npm test`.
- [ ] **Step 5: Commit** `feat: the trip page refreshes itself while the payment is processing`.

### Task 8: CI and docs

**Files:**
- Modify: `.github/workflows/ci.yml` (the payments job also runs `dotnet test --project tests/Airbnb.PaymentProvider.Tests`), `ci/local-ci.sh` (run every `services/<service>/tests/*` project instead of deriving one name), `CLAUDE.md` (repository layout: the provider in the payments solution; the payment service paragraph: the provider, webhooks, events, reconcile-on-read, refunds at the provider; the AppHost layout line; reconciler 2 minutes), `README.md` (the payment bullet and the `aspire run` resource list)

- [ ] **Step 1: Make the changes.** Then check: `sh -n ci/local-ci.sh`, and `grep -n "PaymentProvider" .github/workflows/ci.yml`.
- [ ] **Step 2: Run the full local CI** (`sh ci/local-ci.sh`; the smoke test already ran in Task 6). Expected: "local CI passed".
- [ ] **Step 3: Commit** `docs: the payment provider and its webhooks; CI runs the provider tests`.

### Task 9: Verify on the local cluster

- [ ] **Step 1: Deploy.** Run `pwsh backend/deploy-local.ps1`; it refuses any context but `docker-desktop`. Then `kubectl get pods -n airbnb`: `payment-provider` and `payments` are Running and Ready.
- [ ] **Step 2: Book with the slow card on http://localhost:3000.** The trip page reads "Payment processing", then "Confirmed" within about 15 s without a reload. `kubectl logs -n airbnb deploy/payment-provider-deployment` shows the delivery.
