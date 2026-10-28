# Chat service: design

Date: 2026-10-29. Status: proposed; built without further questions at the user's request ("please continue", after
"just implement until you finished").

## Intent

The third microservice next to the monolith, from the approved brainstorm ("guests message a host from the listing page
and see replies live; a service with live updates (SignalR) and its own kind of database, e.g. MongoDB, deployed and
scaled on its own"). Notifications taught events and payments taught one service calling another. Chat teaches the rest:

- a service the **browser** talks to directly, which means finding it and authenticating with it;
- **stateful live connections** (SignalR over WebSockets) that keep working when the service runs as **two instances**;
- a service that **picks its own kind of storage** (MongoDB);
- the **API gateway** (YARP) from the brainstorm ("added with whichever comes first"): chat is the first service the
  browser reaches, so the gateway starts here.

## Goals

- The listing page has **Message host** for signed-in viewers who aren't the host. It opens (or reopens) the guest's
  conversation about that listing.
- `/inbox` lists my conversations, as guest and as host, newest first. Each shows the listing, the other person, the
  last message and my unread count, and the list updates live.
- `/inbox/[id]` is the thread. New messages appear live in every open tab of both people, and opening the thread marks
  it read.
- Seed listings have demo hosts with no accounts. The first guest message in such a conversation gets an automatic reply
  from the host about 1.5 s later, delivered live, so the live path can be tried with one account. Real hosts (people
  who created a listing) answer for real.
- The service runs as two instances in the AppHost, and a message reaches people connected to either one (Redis
  backplane).

## Non-goals

- Attachments, typing indicators, presence, editing or deleting messages, email or push notifications for messages, an
  unread badge in the nav, search, moderation.
- Chat in mock mode. Chat needs the backend: mock mode hides **Message host**, and `/inbox` says messaging needs the
  backend.
- Routing Next's server-side API calls through the gateway (see Gateway).

## Anti-goals

- The browser holding the long-lived session token: the `session` cookie stays httpOnly.
- Reading or writing a conversation you're not part of.
- A message that only reaches people connected to the instance that received it.

## Design

### Who talks to whom

```
browser ─ pages and /api/* (session cookie) ─► Next ─► monolith                         (unchanged)
browser ─ GET /api/chat/token ─► Next ─ POST /api/auth/chat-token ─► monolith (Identity signs a JWT)
browser ─ POST /api/chat/conversations ─► Next ─ POST /conversations (X-Service-Key) ─► chat
browser ═ WebSocket /chat/hub?access_token=<JWT> ═► gateway (YARP) ═► chat ×2 ─ Redis backplane, MongoDB
```

### Authentication: token exchange

- **Identity module:** `POST /api/auth/chat-token` (session required) returns `{ token, expiresAt }`. The token is a
  JWT signed HS256 with `Identity:ChatToken:SigningKey` (at least 32 bytes):
  - `sub` is the user id and `name` the user's name;
  - `iss` is `airbnb-identity` and `aud` is `chat`;
  - it lives 10 minutes, timed by `TimeProvider`.

  Without a configured key the endpoint is 404 (chat is off), like the admin endpoints.
- **Next:** `GET /api/chat/token` (session required; 404 in mock mode) relays that and adds `hubUrl` (`CHAT_HUB_URL`:
  the gateway's `/chat/hub`). This is how the browser finds the service: at runtime, from the server.
- **Chat service:** validates the JWT with JwtBearer (issuer, audience, lifetime, HS256 only, key `Chat:TokenKey`).
  Browsers can't set headers on a WebSocket, so the hub also reads it from `access_token` in the query string. Hub
  connections close when the token expires (`CloseOnAuthenticationExpiration`), and the client reconnects with a fresh
  one: its `accessTokenFactory` fetches a token each time.

### Conversations start through Next

Host listings still live in the Next server, as with booking quotes, so only Next knows a listing's host.

`POST /api/chat/conversations { listingId }` (Next, session required):
- looks the listing up: unknown → 404, your own listing → 400;
- calls the chat service's `POST /conversations` with `X-Service-Key` = `Chat:ServiceKey`, vouching for
  `{ listingId, listingTitle, hostId, hostName, guestId, guestName, hostIsDemo }`. `hostIsDemo` is true for seed
  listings, whose hosts have no accounts.

It's idempotent per (listing, guest): the existing conversation comes back. → `{ id }`.

### Chat service (`services/chat`)

Same shape as the other services: own solution and props, shares only ServiceDefaults, run by the AppHost.

**Storage.** MongoDB database `chat` (AppHost resource `chatdb`). Chosen because a conversation and its messages are
documents read whole, with no joins and mostly appends.
- `conversations`:
  - fields: `_id` (`cv_` + GUIDv7), listingId, listingTitle, hostId, hostName, guestId, guestName, hostIsDemo, createdAt,
    lastMessageAt, lastMessageText, guestUnread, hostUnread, autoRepliedAt;
  - unique index on (listingId, guestId); indexes on (guestId, lastMessageAt) and (hostId, lastMessageAt).
- `messages`:
  - fields: `_id` (`msg_` + GUIDv7), conversationId, senderId, text, sentAt;
  - index on (conversationId, sentAt).

**`POST /conversations`** (service key only), as above.

**Hub `/hub`** (JWT, WebSockets only):
- `ListConversations()` returns the caller's conversations as guest or host: id, listing, the other person's name, last
  message, lastMessageAt and the caller's unread count. At most 50, newest first.
- `GetMessages(conversationId)` returns the latest 100 messages, oldest first.
- `Send(conversationId, text)`:
  - trims the text and requires 1–2000 characters;
  - saves the message and bumps the other side's unread count;
  - sends `message` (conversation id + message) to both people's connections with `Clients.Users`, on whichever instance
    they're connected to.

  Limit: 30 messages a minute per user (per instance), refused with a `HubException`.
- `MarkRead(conversationId)` sets my unread count to 0 and sends `read` to my other connections.
- A conversation you're not part of gets `HubException("Conversation not found")`, so its existence doesn't leak.

**Demo hosts.** The first guest message in a `hostIsDemo` conversation claims `autoRepliedAt` atomically and queues the
reply in memory. A background worker posts it as the host after `Chat:AutoReplyDelay` (default 1.5 s), live. It's lost
if the service restarts first; it's a demo.

**Scale.** SignalR's Redis backplane on the `redis` connection (channel prefix `chat`) lets `Clients.Users` reach
connections on any instance. Clients use WebSockets without the negotiate request (`skipNegotiation`), so nothing needs
sticky sessions behind the gateway.

### Gateway (YARP)

`Aspire.Hosting.Yarp` adds resource `gateway` with one route: `/chat/{**catch-all}` → the chat service, prefix removed.
The browser reaches the chat service only through the gateway, at one address; future browser-facing services become
more routes.

Next's server-side calls keep going straight to the monolith. The API trusts only loopback proxies for the browser's IP
(per-IP rate limiting), and the gateway runs in a container, so putting it in that path would put every user in one
rate-limit bucket.

### Frontend

- `lib/chat/`: `connectChat()` wraps `@microsoft/signalr` (fetches the token and `hubUrl`, WebSockets with
  `skipNegotiation`, `withAutomaticReconnect`) behind typed calls and events, with payloads validated by Zod.
- **Message host** sits beside the HostCard on `/rooms/[id]`, in api mode when the viewer isn't the host. Signed out it
  links to `/login?next=/rooms/<id>`.
- `/inbox` and `/inbox/[id]` (requireSession) are client components on one connection:
  - the list and the thread update live;
  - the composer sends on Enter, with Shift+Enter for a new line;
  - incoming messages are announced through `aria-live`.
- **Messages** joins AccountLinks (the desktop menu and the mobile sheet).
- Mock mode: no button, and `/inbox` shows "Messaging needs the backend".

### AppHost

- `AddMongoDB("mongo")`: persistent, with a data volume and Mongo Express; database `chatdb` (`chat`).
- Secret parameters `chat-service-key` (Next and chat) and `chat-token-key` (the API signs, chat validates).
- The `chat` project on its `http` profile with `WithReplicas(2)`, referencing `chatdb` and `redis`.
- `gateway` (YARP) with the chat route.
- The API gets `Identity__ChatToken__SigningKey`. The frontend gets `CHAT_HTTP` (the chat service, for Next's server
  calls), `CHAT_SERVICE_KEY` and `CHAT_HUB_URL` (the gateway's `/chat/hub`).

## Testing

- **Chat service:** integration tests against MongoDB and Redis containers (port readiness), on real Kestrel so the hub
  runs over WebSockets:
  - the service key is required;
  - a conversation is idempotent per listing and guest;
  - the hub refuses a missing, expired, wrong-audience or wrongly signed token;
  - only participants read or write;
  - a message reaches both people's connections, including across two instances that share Redis;
  - unread counts and MarkRead;
  - the demo reply arrives once;
  - the rate limit, and text validation.
- **Monolith:** the chat-token endpoint: 401 without a session, 404 without a key, the claims, the 10-minute lifetime.
- **Frontend:**
  - the token and conversation routes: session required, 404 in mock mode, own listing 400, unknown 404, the vouched
    payload;
  - Message host;
  - the inbox and thread with a mocked connection;
  - the mock-mode notice.
- **AppHost smoke test:** register through the frontend, start a conversation about a seed listing, connect through the
  gateway with the frontend's token, send, and receive the demo host's reply live.

## Calls made without asking

- Token exchange through the monolith, rather than the session token in the browser or Next signing tokens.
- Conversations created only through Next, with a service key, because host listings live there.
- The demo-host automatic reply on seed listings.
- WebSockets only with no negotiate request; the Redis backplane; two replicas.
- The gateway fronts the chat service only; Next's server calls stay direct.
- MongoDB (named in the brainstorm), browsable in Mongo Express.
- No chat in mock mode.
