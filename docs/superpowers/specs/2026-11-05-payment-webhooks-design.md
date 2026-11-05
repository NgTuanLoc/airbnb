# Payment webhooks: design

Date: 2026-11-05. Status: approved in chat ("LGTM" on the proposal, after "go straight" skipped the questions); built
without further questions, as with the other services.

## Intent

A webhook is how a system outside yours tells you, later, that something happened. Inside this app the broker already
does that job, so the webhook belongs at the edge: the card processor calling the payment service. Today the processor
is `FakeProcessor`, a class inside the payment service, so nothing can call back, and the slow test card shows the gap:
the API stops waiting after about 4 seconds, the booking sits on "Payment processing" until the reconciler's next
30-second round, and the trip page changes only when the guest reloads.

The processor becomes a fake payment provider of its own (a small fake Stripe) that answers at once and reports
outcomes by signed webhook. The payment service learns to receive webhooks the way real integrations must: verify the
signature, survive duplicates and races, recover lost deliveries, and compensate when a success arrives too late. It
announces each outcome on the broker, so a slow payment confirms its booking within seconds instead of a polling round.

## Goals

- A fake provider (`payment-provider`) with a Stripe-like charge API and the same test cards. Most charges settle
  synchronously; the slow card answers `processing` and settles 10 s later. Every change of a charge is sent to the
  payment service as a signed webhook, retried until a 2xx.
- The payment service charges through the provider and receives its webhooks at `POST /webhooks/provider`.
- A payment that leaves `processing` is announced on the broker (`payment-succeeded`, `payment-declined`), whichever
  path settled it; Bookings confirms or declines the pending booking from the event.
- Lost webhooks are recovered: reading a processing payment asks the provider, and the API's reconciler (now every
  2 minutes) reads every pending booking's payment.
- Voiding and refunding happen at the provider, so money can't stay taken for a booking the guest doesn't get.
- The trip page refreshes itself while its booking says "Payment processing".
- Dashboard commands on the provider: resend the latest webhook (to watch a duplicate do nothing), dispute a payment.

## Non-goals

- Real Stripe (the event format and signature scheme follow Stripe's, so a real client could replace the fake later),
  3-D Secure, async refunds, dispute outcomes (won/lost), webhooks we send to others.
- A hosted card page on the provider: the card still goes guest → Next → API → payment service → provider, passed
  through once and never stored, as today.
- Durability inside the fake provider: it keeps charges and pending deliveries in memory (a real provider persists and
  retries for days). A restart loses them, which the reconciliation covers.

## Anti-goals

- A forged, replayed or tampered webhook changing a payment.
- A guest charged for a booking they don't get, a booking confirmed without a successful payment, or one booking charged
  twice, whatever duplicates, races or retries happen.
- Card numbers or CVCs stored or logged anywhere, including in webhook payloads.

## Design

### Fake provider (`services/payments/src/Airbnb.PaymentProvider`, resource `payment-provider`)

It stands in for an outside company and shares no code with the payment service (only ServiceDefaults, for telemetry).
It lives in the payments solution because it exists only for that service; its tests are
`tests/Airbnb.PaymentProvider.Tests`.

- Settings `Provider:ApiKey`, `Provider:WebhookUrl`, `Provider:WebhookSecret` (all required at startup),
  `Provider:SlowCardDelay` (10 s), `Provider:WebhookRetryDelay` (1 s).
- Every endpoint but health needs `X-Api-Key` = `Provider:ApiKey` (constant-time compare).
- Charges are keyed by `reference` (the booking id), which is also the idempotency key: one charge per reference.
  - `POST /charges` `{ reference, amount, currency, card: { number, expMonth, expYear, cvc } }` → 200 with the charge
    `{ id, reference, amount, currency, status, declineReason }`. Status `succeeded`, `declined` (with
    `card_declined` / `insufficient_funds`) or `processing`. The same reference again returns the stored charge; with
    a different amount, 409 `idempotency_conflict`. A bad request → 400 `invalid_request`.
  - Test cards (by number, spaces ignored): `…0002` declined `card_declined`; `…9995` declined `insufficient_funds`;
    `…0119` answers 500 `processing_error` twice per reference (nothing recorded), then succeeds; `…0077` answers
    `processing` and succeeds after `SlowCardDelay`; anything else succeeds. Card data is used for that decision only.
  - `GET /charges/{reference}` → the charge, or 404.
  - `POST /charges/{reference}/refund` → `succeeded` becomes `refunded`; `declined`, `refunded` and `disputed` stay as
    they are (nothing to give back); `processing` → 409 `charge_processing` (try again once it settles); unknown → 404.
  - `POST /disputes` `{ reference }`: plays the guest's bank. `succeeded` becomes `disputed`; anything else 409; unknown 404.
  - `POST /events/resend-latest` → sends the most recent event again (same id); 404 when there is none.
- Webhooks: each status change (created settled, slow settle, refund, dispute) sends an event to `Provider:WebhookUrl`:
  - Body (camelCase JSON): `{ id: "evt_…", type, created: <unix seconds>, data: { object: <charge> } }`. Types
    `charge.succeeded`, `charge.failed`, `charge.refunded`, `charge.dispute.created`.
  - Header `Provider-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with Provider:WebhookSecret>`
    (Stripe's scheme), signed afresh for every attempt.
  - A 2xx answer delivers it. Otherwise it is tried again after `WebhookRetryDelay` × 1, 5, 25, 125, 625 (6 attempts,
    about 13 minutes at the default), then dropped with an error log. Deliveries run concurrently, so they can arrive out
    of order.
- In memory, one lock around charge changes (a fake's ceiling; marked as such in code).
- `AsHttpApi()` like the other services (health check, Scalar in Development).

### Payment service (`services/payments`)

- Settings: `Payments:ProviderKey` and `Payments:WebhookSecret`, required at startup. `FakeProcessor` and
  `Payments:SlowCardDelay` go; `CardValidator` stays (cards are checked before they're sent on).
- `ProviderClient` (named `HttpClient` `payment-provider`, `https+http://payment-provider`, header `X-Api-Key`).
  POST isn't retried by ServiceDefaults' resilience handler, so it retries charges itself: 3 attempts of 2 s, the same
  reference each time.
- `POST /payments` (charge): validation and the `processing` claim as today, then the provider (the caller's
  cancellation still ignored once the claim is made):
  - `succeeded` / `declined` → settled (below) → 201 / 402 as today.
  - `processing`, or no answer after the attempts (5xx, timeouts) → the payment stays `processing` → 202 with the
    payment. A charge that may have happened is never forgotten: the webhook or a refresh settles it.
  - refused (400, 401, 403, 409: nothing was charged) → the claim is released → 503 `processor_error`, as a processor
    error is today, and logged as an error.
  - A repeat request returns the stored outcome, `processing` included (202; it was a 409 `payment_in_progress`).
- Settling: one transaction moves the payment out of `processing` (a conditional update, so only one path wins) and,
  through Wolverine's EF Core outbox, publishes `payment-succeeded { bookingId }` or
  `payment-declined { bookingId, declineReason }` to the fanout exchange `payments`. The charge answer, the webhook and
  the refresh all settle this way, so every payment is announced exactly once.
- `POST /webhooks/provider` (no service key; the signature is the authentication):
  - Body read raw, at most 64 KB (413 beyond). `Provider-Signature` checked over the raw bytes with
    `Payments:WebhookSecret`, constant-time, any `v1` may match (so a secret can rotate); the timestamp must be within
    5 minutes of now. Otherwise 400 `invalid_signature`, and nothing is read from the body. Unparsable JSON → 400.
  - One transaction: the event id goes into `webhook_events` (`INSERT … ON CONFLICT DO NOTHING`); a repeat answers 200
    and changes nothing. Then by type: `charge.succeeded` settles as succeeded; `charge.failed` settles as declined
    with its reason; `charge.refunded` moves `succeeded` → `refunded`; `charge.dispute.created` moves `succeeded` →
    `disputed` (logged as a warning). Other types are recorded and ignored. Out-of-order or late events find the
    payment in another status and change nothing.
  - 200 once committed; any failure → 500, and the provider tries again.
- `GET /payments/{bookingId}`: a `processing` payment is first refreshed from the provider (2 s at most); a charge
  that has settled there is settled here (and announced). This is how lost webhooks are recovered: the API's
  reconciler reads every pending booking's payment.
- `POST /payments/{bookingId}/void`: the upsert as today, and in the same transaction a durable local `RefundPayment`
  message. Its handler asks the provider to refund: 200 or 404 is done; `charge_processing` or no answer throws, so
  Wolverine retries (1 s, 3 s, 10 s, then 1/5/30 minutes, then the error queue). So a charge still processing when
  the API gave up is refunded once it settles.
- `booking-cancelled` refunds at the provider the same way, then marks the payment `refunded`.
- Status `disputed` joins `succeeded`/`declined`/`voided`/`refunded`/`processing`.
- Table `webhook_events` (`EventId` PK, `Type`, `ReceivedAt`), migration `WebhookEvents`.

### Monolith

- `PaymentsClient`: a 202 means pending (no warning), like no answer.
- Queue `bookings.payments` bound to the `payments` exchange (durable inbox). Handlers in `Airbnb.Api/Messaging/` (the
  monolith's own copies of the two records, `[MessageIdentity]`) call `IBookingPayments.SettleAsync(bookingId, paid)`,
  a new interface in `Airbnb.Modules.Bookings.Contracts`; Bookings implements it (`Integration/`) with
  `PaymentOutcomes`: a pending booking is confirmed (with `booking-confirmed`, through the outbox) or declined; any
  other status means it was settled already, and nothing happens. Status is the concurrency token, so the event, the
  booking request and the reconciler can race safely, as today.
- `PaymentReconciler`: every 2 minutes by default (was 30 s), now the backup for lost webhooks; a `disputed` payment
  confirms a pending booking like `succeeded` (the money was taken; the dispute is a separate matter).

### Frontend

- `RefreshWhilePending` (client): `router.refresh()` every 3 s for up to 2 minutes, rendered on `/trips/[id]` while
  the booking is pending. The status line becomes an `<output>`, so the change is announced.

### AppHost

- `Keys` gains `payment-provider-key` (the payment service's API key at the provider) and `payment-webhook-secret`
  (signs and verifies webhooks), both generated like the other keys.
- `AddPayments` adds the provider; the payment service references it (service discovery), waits for it and gets both
  keys; the provider gets both keys and `Provider__WebhookUrl` = the payment service's http endpoint +
  `/webhooks/provider`.
- Dashboard commands on `payment-provider`: **Resend the latest webhook** and **Dispute a payment** (a Booking id
  argument). `WithAdminCommand` takes the key's header name (the provider's is `X-Api-Key`).
- On the local cluster the provider is one more Deployment, reached only inside the cluster.

### CI and docs

- The payments job and `ci/local-ci.sh` run both of the payments solution's test projects; the Sonar scan already finds
  every `services/*` solution.
- CLAUDE.md and README describe the provider, the webhook rules and the new flow.

## Testing

- Provider (`WebApplicationFactory`, the webhook client's handler swapped for a capturing one): each test card;
  idempotency and the amount conflict; the flaky card's two 500s; the slow card's `processing`, then
  `charge.succeeded`; the signature verifies with the secret; failed deliveries are retried until delivered; refund and
  dispute rules; resend repeats the id; the API key is required; no card data in any event.
- Payment service (Postgres and LavinMQ containers as today; a fake provider as the `payment-provider` client's
  handler): the charge outcomes (201, 402, 202, 503) and idempotency; the caller's cancellation is ignored; webhook
  signature valid, tampered, stale and missing; a duplicate event; each event type's transition; one event on the
  `payments` exchange per settled payment, whichever path settled it; refresh on read; void → refund at the provider,
  retried while the charge is processing; `booking-cancelled` → refund at the provider; card data never stored; keys
  required.
- Monolith: `payment-succeeded` and `payment-declined` published to the `payments` exchange settle a pending booking
  (`booking-confirmed` once); duplicates and settled bookings don't change; a 202 from the payment service means pending.
- Frontend: `RefreshWhilePending` with fake timers; the trip page renders it only while pending.
- AppHost smoke test: the slow card gets 202 pending and is confirmed within 60 s (provider → webhook → payment service
  → broker → API).

## Calls made without asking

- The provider lives in the payments solution and keeps its state in memory.
- Stripe's signature scheme and event shape; `X-Api-Key` for the provider's API; two generated keys.
- Every move out of `processing` is announced, by whichever path makes it, rather than only webhook-settled ones:
  one rule, and the monolith treats duplicates as no-ops.
- Event ids are recorded although the status checks already make repeats harmless: it is the receipt log, and it
  protects any future handler step that isn't guarded by a status.
- Reconcile-on-read (`GET /payments/{id}` asks the provider) instead of a second reconciler inside the payment service.
- A provider that doesn't answer leaves the payment `processing` (202) instead of the old 503: the charge may have
  happened.
- Disputes only mark the payment; nothing else reacts yet.
