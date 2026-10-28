# Notification Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A separate .NET notification service, run by the same AppHost, emails guests when a booking is confirmed or cancelled and reminds them to review the day after check-out, learning about bookings only from events the monolith publishes.

**Architecture:** Bookings publishes `booking-confirmed` / `booking-cancelled` through Wolverine's EF outbox to a fanout exchange `bookings` on the `messaging` broker. The service (own solution under `services/notifications`, own `notifications` database) consumes them with Wolverine, records each email once in `sent_emails`, schedules reminders with Wolverine's durable scheduling, and sends with MailKit to Mailpit.

**Tech Stack:** .NET 10, Wolverine 6.40 (RabbitMQ transport, EF Core + Postgres persistence), EF Core 10 + Npgsql, MailKit 4.18.2, Aspire 13.6.4 (`CommunityToolkit.Aspire.Hosting.MailPit` 13.6.1), Testcontainers.

**Spec:** `docs/superpowers/specs/2026-10-28-notification-service-design.md`

## Global Constraints

- The service references nothing under `backend/` except `backend/src/Airbnb.ServiceDefaults`; it has its own copies of the event records.
- Message identities on the wire: `booking-confirmed`, `booking-cancelled`. Exchange `bookings` (fanout); service queue `notifications.bookings`.
- Event fields exactly: confirmed `bookingId, listingId, listingTitle, guestName, guestEmail, checkIn, checkOut, adults, children, total, confirmedAt`; cancelled `bookingId, listingId, listingTitle, guestName, guestEmail, checkIn, checkOut, cancelledAt`.
- Aspire names: `mailpit` (Mailpit), `notifications` (both the service resource and its Postgres database: database resource `notificationsdb` with database name `notifications`), connection `messaging` for the broker.
- Email kinds: `confirmed`, `cancelled`, `review-reminder`; sender `Airbnb <no-reply@airbnb.local>`; reminder at check-out + 1 day, 10:00 UTC; title fallback `your stay`.
- Config: `Notifications:AdminKey` (header `X-Admin-Key`), `Notifications:FrontendUrl`.
- Subjects: `Your stay at {title} is confirmed`, `Your stay at {title} is cancelled`, `How was your stay at {title}?`.
- Warnings are errors in both solutions; tests pass `TestContext.Current.CancellationToken`.

## Review Focus

- The same `booking-confirmed` delivered twice sends one email (Task 3 test `Duplicate_delivery_sends_one_email`).
- A cancellation arriving before the confirmation (out of order) still leaves no reminder (Task 3 test `Cancelled_before_confirmed_never_reminds`).
- SMTP down: the message is retried and the email sent once Mailpit is back, never twice (Task 3 test `Smtp_outage_is_retried_and_sends_once`).
- A booking that fails to save publishes nothing (Task 1 test `Overlapping_booking_publishes_nothing`).
- An old quote without `title` still books, and its emails say `your stay` (Task 1 test `Quote_without_title_still_books`; Task 2 rendering test).

---

### Task 1: Monolith publishes booking events with the listing title

**Files:** create `backend/src/Modules/Bookings/Airbnb.Modules.Bookings.Contracts/` (`BookingConfirmed.cs`, `BookingCancelled.cs`, csproj); modify `Stays.Contracts/ListingBookingInfo.cs` (+ `Title`), `Stays/Listings/ListingLookup.cs`, `Bookings/Booking.cs` (+ `ListingTitle`), `Bookings/CreateBooking.cs` (QuoteInput + `Title`, outbox), `Bookings/CancelBooking.cs` (outbox), Bookings migration `AddListingTitle`, `Airbnb.Api/Program.cs` (exchange routing), `ModuleRulesTests.cs` (Contracts map), `Airbnb.slnx`; frontend `lib/repositories/http/http-booking-repository.ts` (+ quote `title`) and its test.

**Produces:** `public sealed record BookingConfirmed(string BookingId, string ListingId, string ListingTitle, string GuestName, string GuestEmail, DateOnly CheckIn, DateOnly CheckOut, int Adults, int Children, decimal Total, DateTimeOffset ConfirmedAt)` and `BookingCancelled(string BookingId, string ListingId, string ListingTitle, string GuestName, string GuestEmail, DateOnly CheckIn, DateOnly CheckOut, DateTimeOffset CancelledAt)`, identities set with `[MessageIdentity("booking-confirmed")]` / `("booking-cancelled")` (the Contracts project may reference `WolverineFx` for the attribute only; ledger it).

- [ ] Failing tests (`Airbnb.Api.Tests/Bookings/BookingEventsTests.cs`, a temporary queue bound to the `bookings` exchange via RabbitMQ.Client, or Wolverine's `TrackActivity`):
  - `Confirming_publishes_booking_confirmed` — fields as in Global Constraints; `listingTitle` = Stays title for `l13`.
  - `Cancelling_publishes_booking_cancelled`.
  - `Overlapping_booking_publishes_nothing` — the 409 path sends no event.
  - `Quote_without_title_still_books` — `hl-` booking with a quote lacking `title` → 201, `listingTitle` = `your stay`.
  - frontend: the quote sent for an `hl-` booking includes `title`.
- [ ] Run → fail. Implement; run Api.Tests (all), Unit, Architecture, frontend tests → pass. Commit `feat: publish booking events with the listing title`.

### Task 2: Service skeleton, contracts and email rendering

**Files:** create `services/notifications/` with `global.json` (copy of backend's), `Directory.Build.props`, `Directory.Packages.props`, `Airbnb.Notifications.slnx`, `src/Airbnb.Notifications/` (`Airbnb.Notifications.csproj`, `Program.cs`, `Contracts/BookingConfirmed.cs`, `Contracts/BookingCancelled.cs`, `Email/EmailComposer.cs`, `Reminders/ReminderTime.cs`), `tests/Airbnb.Notifications.Tests/` (csproj, `EmailComposerTests.cs`, `ReminderTimeTests.cs`).

**Produces:** `internal sealed record EmailMessage(string To, string ToName, string Subject, string TextBody, string HtmlBody)`; `static class EmailComposer { EmailMessage Confirmed(BookingConfirmed, Uri frontend); EmailMessage Cancelled(BookingCancelled, Uri frontend); EmailMessage ReviewReminder(PendingReminder, Uri frontend); }`; `static class ReminderTime { DateTimeOffset For(DateOnly checkOut) }` (check-out + 1 day 10:00 UTC).

- [ ] Failing tests: subjects per Global Constraints; confirmed body contains dates (`Mar 3, 2027 – Mar 6, 2027`), guests and `$1,234.00`; reminder links to `{frontend}/rooms/{listingId}`; blank title → `your stay`; HTML body escapes a title like `<b>Tom & Jerry</b>`; `ReminderTime.For(2027-03-06)` = `2027-03-07T10:00:00Z`.
- [ ] Run → fail (`dotnet test` from `services/notifications`). Implement. Pass. Commit `feat: scaffold the notification service and its emails`.

### Task 3: Consuming events, sending once, reminders

**Files:** service `Data/NotificationsDbContext.cs` (+ migration `Initial`; tables `sent_emails (BookingId varchar(40), Kind varchar(20), SentAt, PK both)`, `pending_reminders (BookingId PK, ListingId, ListingTitle, GuestName, GuestEmail, CheckOut, DueAt, Cancelled bool)`), `Email/SmtpSender.cs` (MailKit, connection `mailpit` = `Endpoint=smtp://host:port`), `Handlers/BookingConfirmedHandler.cs`, `Handlers/BookingCancelledHandler.cs`, `Handlers/SendReviewReminderHandler.cs`, `Reminders/SendDueReminders.cs` (endpoint), `Program.cs` (Wolverine: `UseRabbitMqUsingNamedConnection("messaging")`, `ListenToRabbitQueue("notifications.bookings", q => q.BindExchange("bookings", ExchangeType.Fanout))`, `UseDurableInbox`, `PersistMessagesWithPostgresql(..., "wolverine")`, `UseEntityFrameworkCoreTransactions`, retry 3× with cooldowns then error queue; migrate at startup); tests `Integration/*` with a fixture starting Postgres, LavinMQ (`cloudamqp/lavinmq:2.10.3`, port wait), Mailpit (`axllent/mailpit`, ports 1025/8025, reads `GET /api/v1/messages`).

**Interfaces:** handlers are public classes (Wolverine), `SendReviewReminder(string BookingId)` message scheduled with `context.ScheduleAsync(message, ReminderTime.For(checkOut))`; a reminder runs only if its `pending_reminders` row exists and isn't cancelled; cancelled-before-confirmed is handled by the cancel handler inserting a `Cancelled = true` row.

- [ ] Failing tests: `Confirmed_sends_one_email`, `Duplicate_delivery_sends_one_email`, `Cancelled_sends_a_cancellation_and_drops_the_reminder`, `Cancelled_before_confirmed_never_reminds`, `Send_due_reminders_sends_each_once` (admin key; no key configured → 404; wrong key → 401), `Smtp_outage_is_retried_and_sends_once` (stop Mailpit, publish, start it, one email).
- [ ] Run → fail. Implement. Pass. Commit `feat: send booking emails once and schedule review reminders`.

### Task 4: AppHost, smoke test, CI, docs

**Files:** `backend/src/Airbnb.AppHost/AppHost.cs` + csproj (`ProjectReference` to the service, `CommunityToolkit.Aspire.Hosting.MailPit`), `backend/Directory.Packages.props`, `backend/tests/Airbnb.AppHost.Tests/AppHostSmokeTests.cs`, `.github/workflows/ci.yml` (job `notifications`: `dotnet test` in `services/notifications`), `README.md`, `CLAUDE.md`.

- [ ] AppHost: `AddMailPit("mailpit").WithLifetime(Persistent)`; `postgres.AddDatabase("notificationsdb", "notifications")`; `AddProject<Projects.Airbnb_Notifications>("notifications")` with references to `notificationsdb`, `messaging`, `mailpit`, waits, `Notifications__AdminKey` (generated parameter `notifications-admin-key`), `Notifications__FrontendUrl` = frontend endpoint, `WithHttpCommand("/reminders/send-due", "Send due reminders now", …)` adding `X-Admin-Key`.
- [ ] Smoke test: register a guest, book `l14` in a random far-future month, poll Mailpit's HTTP API (`mailpit` endpoint `http`) for a message to the guest's email with subject `Your stay at … is confirmed` (60 s).
- [ ] Run the AppHost tests → pass; by hand under `aspire start`: book, cancel, run the command, see three emails in Mailpit. Docs. Commit `feat: run the notification service and Mailpit in the AppHost`.
