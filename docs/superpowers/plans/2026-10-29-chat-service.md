# Chat service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guest–host messaging with live replies: a chat microservice (SignalR, MongoDB, Redis backplane, two instances) reached by the browser through a YARP gateway with a JWT minted by the monolith.

**Architecture:** The Identity module signs a 10-minute JWT for audience `chat`; Next relays it with the hub URL. Next creates conversations through the chat service's service-key endpoint, vouching for the listing's host, since host listings live in Next. The browser opens one WebSocket through the gateway; the hub checks membership on every call and delivers with `Clients.Users`, which the Redis backplane spreads across instances.

**Tech Stack:** .NET 10, ASP.NET Core SignalR, JwtBearer, MongoDB (Aspire.MongoDB.Driver), StackExchange.Redis backplane, Aspire 13.6.4 (MongoDB, YARP), Next.js 16 + `@microsoft/signalr`, xUnit v3 + Testcontainers, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-chat-service-design.md`

## Global Constraints

- Aspire packages 13.6.4 (`Aspire.Hosting.MongoDB`, `Aspire.Hosting.Yarp`, `Aspire.MongoDB.Driver`, `Aspire.StackExchange.Redis`); ASP.NET Core packages 10.0.12 (`Microsoft.AspNetCore.Authentication.JwtBearer`, `Microsoft.AspNetCore.SignalR.StackExchangeRedis`, `Microsoft.AspNetCore.SignalR.Client`); npm `@microsoft/signalr` 10.0.11.
- JWT: HS256 only; `iss` `airbnb-identity`, `aud` `chat`, `sub` user id, `name`; lifetime 10 minutes; key = UTF-8 bytes of `Identity:ChatToken:SigningKey` (API) / `Chat:TokenKey` (chat), at least 32 characters; a configured key shorter than that fails at startup; no key → the token endpoint is 404.
- Service key header `X-Service-Key` = `Chat:ServiceKey` (constant-time compare; missing key configured → 401 for everyone).
- Ids `cv_` / `msg_` + `Guid.CreateVersion7().ToString("N")`. Message text trimmed, 1–2000 characters. History: latest 100. Inbox: at most 50, newest first.
- Rate limit `Chat:MessagesPerMinute` default 30 per user per instance. Demo reply delay `Chat:AutoReplyDelay` default 00:00:01.5.
- Hub path `/hub` in the service, `/chat/hub` through the gateway; WebSockets transport only; events `message` and `read`; SignalR's default camelCase JSON.
- Containers in tests wait by port (log checks hang on this machine when the clocks disagree). Warnings are errors; tests pass `TestContext.Current.CancellationToken`. Local runs use `TESTCONTAINERS_RYUK_DISABLED=true` (never committed).
- Never log message text or tokens.

## Review Focus

- A stranger reading or writing a conversation: every hub method checks membership (Task 2 `Strangers_get_not_found`).
- Two "Message host" clicks at once making two conversations: the unique index wins and the loser gets the existing one (Task 2 `Concurrent_starts_make_one_conversation`).
- A long-lived connection outliving its token: it closes at expiry, and the client fetches a new token on reconnect (Task 2 `An_expired_token_closes_the_connection`; Task 4 `connectChat fetches a fresh token for each connect`).
- A message missing people on the other instance (Task 3 `A_message_reaches_a_client_on_the_other_instance`).
- The demo host replying twice when the guest sends twice quickly (Task 3 `A_demo_host_replies_once`).

---

### Task 1: The Identity module signs chat tokens

**Files:** Create `backend/src/Modules/Identity/Airbnb.Modules.Identity/ChatToken.cs`; modify `IdentityModule.cs`; test `backend/tests/Airbnb.Api.Tests/Identity/ChatTokenTests.cs`.

**Interfaces — Produces:** `POST /api/auth/chat-token` → envelope `{ token: string, expiresAt: string (ISO) }`; JWT per Global Constraints.

- [ ] **Step 1: Failing tests** `Needs_a_session` (401), `Is_off_without_a_signing_key` (404), `Signs_a_ten_minute_token_for_the_chat_audience` (validate with `JsonWebTokenHandler` and the test key: issuer, audience, `sub` = registered user id, `name` = their name, `exp − iat` = 600, alg HS256), `A_short_signing_key_fails_at_startup`.
- [ ] **Step 2:** Run `dotnet test --project tests/Airbnb.Api.Tests --filter-class "Airbnb.Api.Tests.Identity.ChatTokenTests"` — Expected: FAIL (404 / no throw).
- [ ] **Step 3:** Implement `ChatToken.Map(IEndpointRouteBuilder)` (mapped only when a key is configured) and the startup length check in `AddIdentityModule`; sign with `JsonWebTokenHandler.CreateToken(SecurityTokenDescriptor)` and `TimeProvider`.
- [ ] **Step 4:** Rerun — Expected: PASS; then the whole Api suite.
- [ ] **Step 5:** Commit `feat: sign chat tokens in the Identity module`.

### Task 2: The chat service: conversations, auth, hub

**Files:** Create `services/chat/` (`global.json`, `Directory.Build.props`, `Directory.Packages.props`, `Airbnb.Chat.slnx`), `src/Airbnb.Chat/` (`Program.cs`, `Properties/launchSettings.json` http 5297, `Data/ChatStore.cs`, `Api/ConversationEndpoints.cs`, `Hubs/ChatHub.cs`, `Hubs/ChatDtos.cs`), `tests/Airbnb.Chat.Tests/` (`Integration/ChatFixture.cs`, `Integration/ConversationTests.cs`, `Integration/HubTests.cs`).

**Interfaces — Consumes:** the Task 1 JWT format (tests mint their own with the same parameters). **Produces:**
- `POST /conversations` (X-Service-Key) body `{ listingId, listingTitle, hostId, hostName, guestId, guestName, hostIsDemo }` → 200 `{ id }` (same id for the same listing + guest); 400 when guest = host or a field is missing.
- Hub `/hub`: `ListConversations(): ConversationSummary[]`, `GetMessages(conversationId): ChatMessage[]`, `Send(conversationId, text): ChatMessage`, `MarkRead(conversationId)`; events `message(ChatMessage)`, `read({ conversationId })`.
- `ConversationSummary { id, listingId, listingTitle, otherName, role ("guest"|"host"), lastMessageText?, lastMessageAt?, unread }`; `ChatMessage { id, conversationId, senderId, text, sentAt }`.

- [ ] **Step 1: Failing tests** (fixture: MongoDB container `mongo:<tag Aspire 13.6.4 uses>` by port 27017; the app on Kestrel via `UseKestrel(0)`; `TokenFor(userId, name, expires?, audience?, key?)`; `ConnectAsync(token)` with the SignalR client over WebSockets, `SkipNegotiation`):
  `Creating_a_conversation_needs_the_service_key`, `A_conversation_is_created_once_per_listing_and_guest`, `Concurrent_starts_make_one_conversation`, `You_cannot_message_yourself`, `The_hub_refuses_bad_tokens` (none, expired, wrong audience, wrong key), `An_expired_token_closes_the_connection`, `Participants_see_their_conversations_and_messages` (role, otherName, newest first), `Strangers_get_not_found` (GetMessages, Send, MarkRead), `A_message_reaches_both_people` (guest's two connections + host's), `Unread_counts_and_mark_read` (host unread 2 after two guest messages; MarkRead → 0 and `read` on the host's other connection), `Text_is_validated` (empty, spaces, 2001 chars → HubException; text stored trimmed).
- [ ] **Step 2:** Run `dotnet test --project tests/Airbnb.Chat.Tests` — Expected: build fails on missing types.
- [ ] **Step 3:** Implement. `ChatStore` owns the collections and indexes (created at startup); start = insert, duplicate key → find; unread via `$inc`; JwtBearer with `access_token` from the query for `/hub`, `MapInboundClaims = false`, an `IUserIdProvider` returning `sub`; `MapHub<ChatHub>("/hub", o => { o.Transports = WebSockets; o.CloseOnAuthenticationExpiration = true; })`.
- [ ] **Step 4:** Rerun — Expected: all pass.
- [ ] **Step 5:** Commit `feat: add the chat service`.

### Task 3: Two instances, demo hosts, and a send limit

**Files:** Modify `services/chat/src/Airbnb.Chat/Program.cs`, `Hubs/ChatHub.cs`; create `Hubs/AutoReplies.cs` (queue + worker), `Hubs/SendLimiter.cs`; tests `Integration/ScaleOutTests.cs`, `Integration/DemoHostTests.cs`; the fixture gains a Redis container (`redis:8.6`, port 6379) and a second app instance.

**Interfaces — Consumes:** Task 2's hub. **Produces:** settings `ConnectionStrings:redis`, `Chat:AutoReplyDelay`, `Chat:MessagesPerMinute`.

- [ ] **Step 1: Failing tests** `A_message_reaches_a_client_on_the_other_instance`, `A_demo_host_replies_once` (two quick guest sends → exactly one host reply event, after the delay, stored, guest unread 1), `Real_hosts_get_no_automatic_reply`, `Sending_too_fast_is_refused` (limit set to 3: the 4th send in a minute → HubException, nothing stored).
- [ ] **Step 2:** Run the chat tests — Expected: those fail.
- [ ] **Step 3:** Implement: `AddSignalR().AddStackExchangeRedis` on the `redis` connection (channel prefix `chat`); claim `autoRepliedAt` with one conditional update; a `Channel<PendingReply>` drained by a `BackgroundService` through `IHubContext<ChatHub>`; a partitioned fixed-window `RateLimiter` per user.
- [ ] **Step 4:** Rerun — Expected: all pass.
- [ ] **Step 5:** Commit `feat: scale chat out over Redis and answer for demo hosts`.

### Task 4: Frontend messaging

**Files:** `package.json` (`@microsoft/signalr` 10.0.11); create `lib/chat/schemas.ts`, `lib/chat/connection.ts` (+ tests), `app/api/chat/token/route.ts` (+ test), `app/api/chat/conversations/route.ts` (+ test), `components/features/chat/message-host-button.tsx`, `inbox-list.tsx`, `conversation-thread.tsx` (+ tests), `app/inbox/page.tsx`, `app/inbox/[id]/page.tsx`; modify `app/rooms/[id]/page.tsx`, `components/features/auth/account-links.tsx`.

**Interfaces — Consumes:** Task 1's endpoint (through the backend relay with the session bearer), Task 2's `POST /conversations` and hub contract. **Produces:** `connectChat(): Promise<ChatConnection>` with `listConversations()`, `getMessages(id)`, `send(id, text)`, `markRead(id)`, `onMessage(cb)`, `onRead(cb)`, `stop()`; env `CHAT_HTTP`, `CHAT_SERVICE_KEY`, `CHAT_HUB_URL`.

- [ ] **Step 1: Failing tests:**
  - token route: 401 without a session; 404 in mock mode; relays the token and adds `hubUrl`; 503 when `CHAT_HUB_URL` is unset;
  - conversations route: 401; 404 in mock mode; 404 for an unknown listing; 400 for your own listing; posts the vouched payload with the service key (seed listing → `hostIsDemo` true, host listing → false) and returns `{ id }`;
  - `connectChat`: builds the connection for `hubUrl` with WebSockets and `skipNegotiation`, and fetches a fresh token for each connect;
  - MessageHostButton: posts and navigates to `/inbox/<id>`; shows the error;
  - InboxList: renders the summaries and moves a conversation to the top with its new text on `message`;
  - ConversationThread: loads history, appends live messages, sends on Enter (not Shift+Enter), marks read, announces through `aria-live`;
  - room page: the button only for non-hosts in api mode;
  - AccountLinks: a Messages link.
- [ ] **Step 2:** Run `npx vitest run lib/chat app/api/chat components/features/chat` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `npm run lint`, `npx tsc --noEmit` — Expected: all clean.
- [ ] **Step 5:** Commit `feat: message hosts from the listing page`.

### Task 5: AppHost, gateway, smoke test, CI, docs

**Files:** `backend/Directory.Packages.props`, `src/Airbnb.AppHost/Airbnb.AppHost.csproj` + `AppHost.cs`, `tests/Airbnb.AppHost.Tests/AppHostSmokeTests.cs` (+ csproj: SignalR client), `.github/workflows/ci.yml` (`chat` job), `README.md`, `CLAUDE.md`.

**Interfaces — Consumes:** everything above.

- [ ] **Step 1:** AppHost: Mongo (persistent, data volume, Mongo Express) + `chatdb`; parameters `chat-service-key`, `chat-token-key`; `chat` project ×2 referencing `chatdb` and `redis`; `gateway` YARP route `/chat/{**catch-all}` → chat (prefix removed); env for the API and the frontend.
- [ ] **Step 2:** Smoke test `A_guest_chats_with_a_demo_host_through_the_gateway`: register through the frontend, `POST /api/chat/conversations` for `l13`, `GET /api/chat/token`, connect to `hubUrl`, send, receive the host's reply.
- [ ] **Step 3:** Run `dotnet test --project tests/Airbnb.AppHost.Tests` — Expected: 5/5 pass (the new check inside the smoke test).
- [ ] **Step 4:** CI `chat` job; README and CLAUDE.md; hands-on under `aspire run` (two browsers, two accounts: a host listing chat, plus the demo reply; Mongo Express shows the documents; both chat replicas serve).
- [ ] **Step 5:** Commit `feat: run the chat service behind a gateway in the AppHost`.
