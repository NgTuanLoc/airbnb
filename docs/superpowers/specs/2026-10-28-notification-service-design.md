# Notification service: design

Date: 2026-10-28. Status: proposed.

## Intent

The user wants to practice microservices without breaking up the monolith: new capabilities built as separate services
next to it. This is the first one (payments and chat are planned later). Guests get emails about their bookings, sent by
a **separate .NET service** that learns about bookings only from events on the message broker. It teaches: services that
talk only through events, a database per service, idempotent consumers, scheduled work, and one trace across services.

The user decided: it runs in the **same Aspire AppHost** as everything else, and email goes to **Mailpit through its
Aspire integration** (`CommunityToolkit.Aspire.Hosting.MailPit`).

## Goals

- Guests receive:
  - **Booking confirmed**: listing title, check-in and check-out, guests, total.
  - **Booking cancelled**: listing title and dates.
  - **Review reminder**: the day after check-out (10:00 UTC), "How was your stay at <title>? Leave a review", linking to
    the listing page. Not sent if the booking was cancelled.
- Each email is sent at most once per booking and kind, however often a message is delivered.
- Locally, every email lands in Mailpit, opened from the Aspire dashboard.
- One booking appears as one trace in the dashboard: monolith → broker → notification service → SMTP.
- A dashboard command **Send due reminders now** sends every pending reminder immediately, so the flow can be tried
  without waiting for a real check-out date.

## Non-goals

- Host emails, push, SMS, user notification preferences, HTML templates beyond a simple layout, localization.
- An API gateway or any browser-facing API on the service (planned with payments/chat).
- Moving anything out of the monolith.

## Anti-goals

- The service calling the monolith (or reading its database) to build an email: events carry everything needed.
- Shared code between the monolith and the service: each owns its copy of the event contract.
- An email for a booking that wasn't saved, or a missing email for one that was.

## Design

### Monolith changes (Bookings and Stays)

- `IListingLookup.FindForBookingAsync` / `ListingBookingInfo` also return the listing **title**; host-listing quotes from
  the Next server carry `title` too (the frontend sends `listing.title`). The booking stores it as `ListingTitle`
  (snapshot, like guest name/email; new migration).
- Creating and cancelling a booking publish `BookingConfirmed` / `BookingCancelled` through Wolverine's
  `IDbContextOutbox<BookingsDbContext>` (booking row + event in one transaction, as `SubmitReview` does), so an event
  goes out exactly when the change commits. The deadlock retry in `CreateBooking` keeps working with the outbox.
- Wolverine routes both to a fanout exchange `bookings` on the existing `messaging` broker (LavinMQ or RabbitMQ). The
  monolith doesn't know who listens.
- Event shape (JSON, camelCase), identified on the wire by name with `[MessageIdentity]`:
  - `booking-confirmed`: `bookingId, listingId, listingTitle, guestName, guestEmail, checkIn, checkOut, adults,
    children, total, confirmedAt`
  - `booking-cancelled`: `bookingId, listingId, listingTitle, guestName, guestEmail, checkIn, checkOut, cancelledAt`

### The service

- `services/notifications/` at the repo root, its own solution (`Airbnb.Notifications.slnx`), projects
  `src/Airbnb.Notifications` (ASP.NET Core worker-style host) and `tests/Airbnb.Notifications.Tests`. It references
  nothing from `backend/` except `Airbnb.ServiceDefaults` (telemetry, health, resilience are platform, not domain), and
  has its own `global.json`, `Directory.Build.props` and `Directory.Packages.props` mirroring the backend's settings.
- Its own copies of the two event records with the same message identities.
- Wolverine with the RabbitMQ transport on the `messaging` connection: a durable queue `notifications.bookings` bound to
  the `bookings` exchange, durable inbox and Wolverine's message storage in its own database.
- Database: `notifications` on the same Postgres server (`postgres.AddDatabase("notifications")`), EF Core, migrated by
  the service itself at startup. Table `sent_emails (BookingId, Kind, SentAt, MessageId)` with a primary key on
  `(BookingId, Kind)`: a handler records the email and sends it; a duplicate delivery finds the row and does nothing.
  The record is written in the same transaction as Wolverine's inbox mark; if SMTP fails, the transaction rolls back
  and Wolverine retries (1 s, 3 s, 10 s, then scheduled retries 1, 5 and 30 minutes later, then the error queue).
- Review reminders: on `booking-confirmed` the service writes a `pending_reminders` row (due check-out + 1 day 10:00 UTC) in
  the same transaction as the confirmation email, and a background sweep (every minute) sends the due ones. On
  `booking-cancelled` the row is marked cancelled (or created cancelled, if the cancellation arrives first). (Changed
  from Wolverine's one-shot scheduling after review: a crash between commit and scheduling lost the reminder for good.)
- `POST /reminders/send-due` (header `X-Admin-Key` = `Notifications:AdminKey`; 404 without a configured key) sends every
  pending reminder now. The AppHost exposes it as the **Send due reminders now** command on the service's resource.
- Email: MailKit over SMTP to the `mailpit` connection; sender `Airbnb <no-reply@airbnb.local>`; plain text plus a
  minimal HTML body; links use `Notifications:FrontendUrl` (the AppHost passes the frontend's URL).

### AppHost

- `builder.AddMailPit("mailpit")` (persistent).
- `builder.AddProject<Projects.Airbnb_Notifications>("notifications")` referencing `notifications` (Postgres database),
  `messaging` and `mailpit`, waiting for them, with the admin-key parameter and the command.
- The AppHost references the service's project across the two solutions (a `ProjectReference` from
  `backend/src/Airbnb.AppHost` to `services/notifications/src/Airbnb.Notifications`), which Aspire supports.

## Testing

- Service unit tests: email rendering (subject, body, link), reminder time (check-out + 1 day, 10:00 UTC).
- Service integration tests (own Testcontainers: Postgres, the AMQP broker, Mailpit or a captured SMTP sink):
  confirmed → one email; the same message twice → one email; cancelled → cancellation email and no reminder;
  send-due → reminder sent once; SMTP down → retried, then sent once it's back.
- Monolith integration tests: creating and cancelling a booking publishes the events with the new fields (asserted with
  Wolverine's tracking); quotes without `title` are still accepted (title falls back to "your stay").
- AppHost smoke test: book a listing through the API and see the confirmation in Mailpit's HTTP API.
- CI: the service's tests run in their own job (Docker, like the integration tests).

## Calls made without asking

- Guests only; host emails later.
- The service lives in `services/notifications` with its own solution, sharing only ServiceDefaults.
- Database per service as a separate database on the shared Postgres server, not a separate server.
- The event carries the listing title; old messages without it fall back to "your stay".
- Reminder at 10:00 UTC the day after check-out; a manual "send due now" command for demos.
