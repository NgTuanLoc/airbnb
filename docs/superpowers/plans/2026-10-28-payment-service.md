# Payment Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guests pay with a (fake) card when they book; a separate payment service charges, and Bookings keeps the booking and the payment in agreement with a pending hold, a reconciler, and void/refund compensation.

**Architecture:** `services/payments` (own solution, own `payments` database) exposes `POST /payments`, `GET /payments/{bookingId}`, `POST /payments/{bookingId}/void` behind a service key, and refunds on `booking-cancelled`. Bookings inserts a pending booking, charges synchronously through a typed resilient `HttpClient`, and settles unknowns with `PaymentReconciler`. The frontend collects the card.

**Tech Stack:** .NET 10, Wolverine 6.40, EF Core 10 + Npgsql, Microsoft.Extensions.Http.Resilience, Aspire 13.6.4, Next.js 16, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-payment-service-design.md`

## Global Constraints

- Statuses: booking `pending|confirmed|declined|cancelled`; payment `succeeded|declined|voided|refunded`.
- Codes: `invalid_card` (400), `card_declined` / `insufficient_funds` (402), `idempotency_conflict` (409). Copy: "Your card was declined", "Your card has insufficient funds", "Check your card details", "Payment processing", "Payment declined".
- Test cards: `4242424242424242` ok, `4000000000000002` card_declined, `4000000000009995` insufficient_funds, `4000000000000119` 503 twice then ok, `4000000000000077` 10 s delay then ok.
- Header `X-Service-Key` = `Payments:ServiceKey` (service) / `Bookings:Payments:ServiceKey` (monolith); Aspire parameter `payments-service-key`; resources `payments`, `paymentsdb` (database `payments`).
- Monolith client: base `http://payments`, per-attempt timeout 4 s, 3 attempts; reconciler interval 30 s (`Bookings:Payments:ReconcileInterval`), decline unknown after 2 min, void after 15 min.
- Never store or log a card number or CVC.

## Review Focus

- Charging twice: the same booking retried or reconciled never creates a second payment (Task 1 `Same_booking_charges_once`; Task 2 `Retries_after_a_timeout_charge_once`).
- A payment that succeeds after the monolith gave up (timeout) still ends confirmed, never "declined but charged" (Task 2 `Late_success_is_confirmed_by_the_reconciler`).
- Nights held while pending: another guest can't book them (Task 2 `Pending_booking_holds_the_nights`).
- Card data never persisted (Task 1 `Card_number_is_never_stored`).
- Cancel of a pending booking voids rather than leaving a charge (Task 2 `Cancelling_pending_voids`).

---

### Task 1: Payment service

**Files:** `services/payments/` (`global.json`, `Directory.Build.props`, `Directory.Packages.props`, `Airbnb.Payments.slnx`), `src/Airbnb.Payments/` (`Program.cs`, `Properties/launchSettings.json` http 5298, `Cards/Card.cs` (Luhn, brand, last4, validation), `Cards/FakeProcessor.cs`, `Data/PaymentsDbContext.cs` + migration, `Api/PaymentEndpoints.cs`, `Api/ServiceKey.cs`, `Contracts/BookingCancelled.cs`, `Handlers/RefundOnCancel.cs`), `tests/Airbnb.Payments.Tests/` (unit + integration with Postgres and LavinMQ).

- [ ] Failing tests: card validation and brands; processor outcomes per test card; `Same_booking_charges_once`; `Different_amount_is_a_conflict`; `Declined_cards_answer_402`; `Invalid_card_answers_400`; `Processor_error_answers_503_then_succeeds`; `Void_is_idempotent`; `Booking_cancelled_refunds_once`; `Requests_need_the_service_key`; `Card_number_is_never_stored`.
- [ ] Implement; tests pass; commit `feat: add the payment service`.

### Task 2: Bookings charges, holds and reconciles

**Files:** Bookings `BookingStatus.cs`, `Booking.cs` (+ `PaymentReference`? no — status only), `CreateBooking.cs`, `CancelBooking.cs`, `GetAvailability.cs`, `Payments/PaymentsClient.cs`, `Payments/PaymentReconciler.cs`, `BookingsModule.cs`, migration `PendingHoldsNights`; Api.Tests `Bookings/PaymentFlowTests.cs` + `Infrastructure/FakePaymentService.cs`; existing booking tests send a test card.

- [ ] Failing tests: `Successful_payment_confirms_and_publishes`; `Declined_payment_frees_the_nights`; `Invalid_card_is_400`; `Pending_booking_holds_the_nights`; `Retries_after_a_timeout_charge_once`; `Unanswered_payment_is_202_pending`; `Late_success_is_confirmed_by_the_reconciler`; `Unknown_payment_is_declined_after_2_minutes`; `Stuck_payment_is_declined_and_voided_after_15_minutes`; `Cancelling_pending_voids`.
- [ ] Implement; all Api/Unit/Architecture tests pass; commit `feat: charge bookings through the payment service`.

### Task 3: Frontend card form and statuses

**Files:** `components/features/bookings/confirm-booking-button.tsx` (+ test), `lib/bookings/schemas.ts`, `lib/api-client/bookings.ts`, `lib/types.ts`, `app/api/bookings/route.ts`, mock booking repository (+ test), trip pages/list status labels (+ tests), `lib/repositories/http/http-booking-repository.ts` (202/402/400 mapping).

- [ ] Failing tests for each; implement; `npm test`, lint, tsc pass; commit `feat: pay by card when booking`.

### Task 4: AppHost, smoke test, CI, docs

- [ ] AppHost wiring per Global Constraints; smoke test: 4242 → confirmed + email, 4000000000000002 → 402; CI job `payments`; README + CLAUDE.md; hands-on under `aspire start` (success, decline, slow card → pending → confirmed by the reconciler, cancel → refunded). Commit `feat: run the payment service in the AppHost`.
