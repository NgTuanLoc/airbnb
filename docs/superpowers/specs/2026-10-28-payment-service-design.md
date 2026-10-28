# Payment service: design

Date: 2026-10-28. Status: proposed; built without further questions at the user's request ("please continue", after
"just implement until you finished").

## Intent

The second microservice next to the monolith (after notifications; chat comes later). Where notifications taught
event-only communication, payments teaches the harder half: **one service calling another directly** over HTTP, with
timeouts, retries, idempotency keys, and a **saga**: a booking and a payment that must end up agreeing without a shared
database transaction, including compensation (void, refund) when they don't.

Guests now pay when they book: "Confirm and pay" takes a card (a fake processor with Stripe-style test cards; no real
money, no real card data).

## Goals

- The booking page asks for a card (number, expiry, CVC), with the test cards listed under it.
- Booking flow (monolith → payments, synchronous):
  1. Bookings saves the booking as **pending** (its nights are held: the overlap rule now covers pending and confirmed).
  2. Bookings calls `POST /payments` on the payment service with the booking id as the idempotency key.
  3. **Succeeded** → the booking becomes confirmed and `booking-confirmed` is published (the notification service emails
     as today) → 201. **Declined** → the booking becomes `declined`, freeing the nights → 402 with a reason the page
     shows. **No answer** (timeout or 5xx after retries) → the booking stays pending → 202, and the trip page says
     "Payment processing".
- A **reconciler** in Bookings settles pending bookings: every 30 s it asks `GET /payments/{bookingId}`; succeeded →
  confirm (+ event), declined → decline, not found after 2 minutes → decline, still unknown after 15 minutes → decline
  and `POST /payments/{bookingId}/void` (compensation).
- Cancelling a confirmed booking refunds it: the payment service listens to `booking-cancelled` on its own queue and
  marks the payment refunded (compensation by event). Refunds and voids are idempotent.
- Test cards (by number; any future expiry, any 3-digit CVC):
  - `4242 4242 4242 4242` succeeds
  - `4000 0000 0000 0002` declined (`card_declined`)
  - `4000 0000 0000 9995` declined (`insufficient_funds`)
  - `4000 0000 0000 0119` the processor errors (500) on the first two attempts, then succeeds (exercises retries)
  - `4000 0000 0000 0077` the processor takes 10 s (exercises the timeout → pending → reconciler)
  - anything else that passes the Luhn check succeeds; a number that fails it, a past expiry or a bad CVC → 400
    `invalid_card`.

## Non-goals

- Real payment providers, 3-D Secure, currencies other than USD, partial refunds, payouts to hosts.
- An API gateway (the frontend still talks only to the monolith through Next).
- Paying for host listings differently (they pay the same way, using the quoted price).

## Anti-goals

- Card numbers or CVCs stored or logged anywhere: the payment service keeps brand + last 4 digits only; the monolith
  never stores card data, only passes it through once.
- A guest charged for a booking they don't get, or a booking confirmed without a successful payment.
- Charging twice for one booking, whatever retries or reconciliations happen.

## Design

### Payment service (`services/payments`)

Same shape as `services/notifications`: own solution (`Airbnb.Payments.slnx`), own `global.json`/props, shares only
`backend/src/Airbnb.ServiceDefaults`, own database `payments` on the shared Postgres (AppHost resource `paymentsdb`).

- `payments` table: `BookingId` (PK, the idempotency key), `Amount numeric(12,2)`, `Currency`, `Status`
  (`succeeded`/`declined`/`voided`/`refunded`), `Brand`, `Last4`, `DeclineReason`, `Attempts`, `CreatedAt`,
  `UpdatedAt`.
- `POST /payments` `{ bookingId, amount, card: { number, expMonth, expYear, cvc } }`:
  - invalid card → 400 `{ code: "invalid_card" }`;
  - an existing row for the booking → that row's outcome again (same status code) without charging; a different amount
    for the same booking → 409 `{ code: "idempotency_conflict" }`;
  - otherwise the fake processor decides; succeeded → 201 `{ bookingId, status, brand, last4 }`; declined → 402
    `{ bookingId, status, declineReason }`; processor error → 503 (nothing stored, so a retry charges again: safe).
- `GET /payments/{bookingId}` → 200 with the row, or 404.
- `POST /payments/{bookingId}/void` → succeeded becomes voided (idempotent; 404 when there's no payment).
- Wolverine consumer of `booking-cancelled` on queue `payments.bookings` (bound to the `bookings` exchange): succeeded →
  refunded; anything else unchanged.
- Every HTTP endpoint requires header `X-Service-Key` = `Payments:ServiceKey` (constant-time compare): only the
  monolith calls it. The key is an Aspire secret parameter `payments-service-key`, given to both.
- Card handling: Luhn, brand from the first digit (4 Visa, 5 Mastercard, 3 Amex), last 4 kept; the full number and CVC
  are never logged (request logging of bodies stays off).

### Monolith (Bookings)

- Statuses: `pending`, `confirmed`, `declined`, `cancelled`. The exclusion constraint is recreated with
  `WHERE ("Status" IN ('pending', 'confirmed'))`; availability counts both.
- `POST /api/bookings` takes an optional `card` (required unless `Bookings:Payments:Required` is false, which only tests
  of unrelated flows use). After the pending insert commits, `PaymentsClient.ChargeAsync` calls the service:
  - typed `HttpClient` to `http://payments` (Aspire service discovery), header `X-Service-Key`, per-attempt timeout 4 s,
    3 attempts with backoff on 5xx/timeouts: POST is retried because the booking id makes it idempotent;
  - outcomes map to the status changes above, through the outbox (`booking-confirmed` only on success).
  - Responses: 201 confirmed booking; 402 `{ code: "card_declined" | "insufficient_funds" }` with text
    "Your card was declined" / "Your card has insufficient funds"; 400 `{ code: "invalid_card" }` "Check your card
    details"; 202 pending booking.
- `PaymentReconciler` (BackgroundService, every 30 s, configurable `Bookings:Payments:ReconcileInterval`): as in Goals.
  Single API instance assumed; each step is idempotent so a second instance would only repeat work.
- Cancel: only pending or confirmed bookings; a pending one is cancelled and voided; a confirmed one publishes
  `booking-cancelled` as today (the payment service refunds).
- `GET` booking DTOs expose the new statuses.

### Frontend

- `ConfirmBookingButton` becomes a small form: card number, expiry (MM/YY), CVC, a "Test cards" note; it sends `card`
  with the booking. 402/400 show the backend's message; 202 navigates to the trip with "Payment processing".
- Trip pages and lists show `pending` as "Payment processing" and `declined` as "Payment declined"; the `Booking` type's
  status union gains both.
- Mock mode: the mock booking repository applies the same test-card rules (declined cards fail with the same codes) so
  the UI behaves alike without the backend.

### AppHost

- `paymentsdb` database, the `payments` project (cross-solution `ProjectReference`, `http` launch profile), references
  to `paymentsdb` and `messaging`, the `payments-service-key` parameter for both the service and the API; the API
  references `payments` (service discovery) and waits for it.

## Testing

- Payment service: unit (Luhn, brand, test-card outcomes, expiry/CVC validation); integration with Postgres + LavinMQ
  containers: charge succeeds once per booking (same request twice → one row, same answer), amount conflict 409,
  declines, invalid card 400, processor error 503 then success, void and refund idempotent, `booking-cancelled` refunds,
  missing/wrong service key 401, card number never stored.
- Monolith: integration with a fake payment service (an in-test HTTP handler replacing the typed client's primary
  handler): success → confirmed + `booking-confirmed`; decline → declined, nights free again, no event; timeout → 202
  pending, then the reconciler settles it each way; void after 15 minutes (time controlled with the tests'
  `MutableTimeProvider`); cancel of pending voids; overlap with a pending booking is refused.
- Frontend: card form, messages per code, pending navigation, statuses, mock test-card rules.
- AppHost smoke test: book with `4242…` → confirmed and emailed; book with `4000 0000 0000 0002` → 402.

## Calls made without asking

- Synchronous charge with a pending hold, a reconciler for the unknowns, void/refund as compensation (choreography for
  refunds, orchestration by Bookings for charges).
- Stripe-style test card numbers; brand + last 4 only.
- A shared service key between the monolith and the payment service (no service mesh/mTLS).
- Declined bookings stay visible to the guest as "Payment declined".
