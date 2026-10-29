# Smart chat box (AI assistant): design

Date: 2026-10-29. Status: approved in chat ("ok, please continue implement with no questions"); everything below the
three goals is my call unless marked as the user's.

## Intent

A chat box on every page where a guest asks questions about the product and gets answers grounded in the app's real
data, from a local model run by Ollama through the AppHost's integration (the user's choice).

## Goals (approved in chat)

1. **Find a place.** "A cabin for 4 in Aspen under $200 a night, ideally with a hot tub." The box searches the real
   listings and answers with two or three that fit, shown as links to their pages. When something important is missing
   (dates, how many people) it asks.
2. **Tell me about this place.** On a listing page: "does it have wifi?", "is it free May 3 to 6?", "what would 3
   nights cost?" It answers from that listing's details, its booking calendar and the same price math the booking page
   uses.
3. **How does this work?** "How do I cancel?", "when is my card charged?", "what's the service fee?", "how do I become
   a host?" It answers from a short guide written from how the app actually behaves.

## Anti-goals (approved in chat)

- It never books, cancels or pays; it links to where the guest does that.
- It sees only public listing information: never anyone's trips, messages or account.
- It doesn't invent places, prices, availability or policies: those come from the data or the guide, or it says it
  doesn't know.

## Non-goals

- Remembering conversations between visits, or across devices (the conversation lives in the open page).
- Answering about the guest's own trips, or acting on them.
- Images in answers, voice, languages other than whatever the model replies in.
- Mock mode: the assistant needs the backend and Ollama, so the box is hidden there.

## Design

### Shape

```
browser ─ POST /api/assistant { messages, listingId? } ─► Next ─ POST /ask ─► assistant ─► Ollama (AppHost)
                                                                                 │ tools (read-only, public):
                                                     Next's catalog API ◄────────┘ /api/listings, /api/listings/{id},
                                                                                   /api/listings/{id}/quote
```

- **A new service, `services/assistant`** (.NET), shaped like the others (own solution and props, shares only
  ServiceDefaults, run by the AppHost), with no database.
- **Model access:** `Microsoft.Extensions.AI` (`IChatClient` with automatic function invocation) over the AppHost's
  Ollama model, through the client integration `CommunityToolkit.Aspire.OllamaSharp`.
- **Stateless:** the browser sends the conversation each time.
- **Why Next's catalog API:** host listings still live in the Next server, and its search filters and price math are
  the app's single source of truth for both kinds of listing. That's a temporary coupling until host listings move to
  the backend; then the catalog URL points at the API instead.
- **The browser reaches the assistant through Next** (`POST /api/assistant`), not the gateway. A streamed HTTP answer
  relays fine, the request stays same-origin, and the browser's IP reaches the assistant's rate limiter through a
  loopback proxy, as with the API.

### The assistant service

**`POST /ask`** takes `{ messages: [{ role: "user" | "assistant", text }], listingId? }`:
- 1 to 10 messages, the last one from the user, each 1 to 1000 characters;
- `listingId` matches `l<digits>` or `hl-<guid>`;
- anything else is 400 `{ code, error }`.

It answers with an **NDJSON stream** (`application/x-ndjson`), one event per line:
- `{"type":"text","text":"…"}`: the reply, piece by piece as the model writes it;
- `{"type":"listings","listings":[{ id, title, city, pricePerNight, rating }]}`: the places the last search found (up to
  3), sent after the text, for the box to show as links;
- `{"type":"done"}` at the end, or `{"type":"error","message":"…"}` if the model or a tool failed. The stream still
  ends cleanly.

**Tools**, all read-only over the catalog's public API (named `HttpClient` `catalog`, base `Assistant:CatalogUrl`):
- `search_listings(city?, category?, guests?, minPrice?, maxPrice?, bedrooms?)` returns up to 5 matches with id, title,
  city, category, price per night, max guests, bedrooms, rating and amenities.
- `get_listing(listingId)` returns the listing's details: description, rooms, amenities, price, rating, host name.
- `quote_stay(listingId, checkIn, checkOut, guests)` returns `available`, the nights, the price line items and the
  total, or the reason the dates don't work.

**System prompt:**
- today's date;
- the cities and categories the catalog has (cities are read from the catalog and cached for 5 minutes);
- the listing the guest is looking at, if any;
- the rules from the anti-goals, plus "plain text, no markdown, under about 120 words";
- the guide, an embedded `guide.md` covering cancelling, payments and test cards, fees, hosting, messaging hosts,
  wishlists and trips.

**Limits:**
- 10 questions a minute per IP (`Assistant:QuestionsPerMinute`), using the forwarded browser IP, with only loopback
  trusted;
- at most 4 tool rounds;
- 400 output tokens;
- 2 minutes per answer.

**Model:**
- `qwen2.5:3b` by default: it calls tools, is about 2 GB, and runs on CPU;
- `Assistant:Model` in the AppHost's configuration swaps it;
- `Assistant:Gpu=true` adds Ollama's NVIDIA GPU support (off by default, since it fails on machines without the
  runtime).

### Next server

**New public catalog routes**, which the assistant's tools use:
- `GET /api/listings/[id]`: the listing, or 404.
- `GET /api/listings/[id]/quote?checkIn&checkOut&guests`:
  - the booking request's own date and guest rules (real dates, check-in not in the past, at most 30 nights, the
    listing's guest cap);
  - availability from the bookings repository (overlap with a pending or confirmed stay);
  - `calculatePriceBreakdown`;
  - → `{ listingId, checkIn, checkOut, nights, available, priceBreakdown }`, or 400 with the reason.

**`POST /api/assistant`** is public (guests needn't sign in):
- 404 in mock mode, and 503 when `ASSISTANT_HTTP` isn't set;
- otherwise it relays to `/ask` with the browser's IP and streams the answer back, allowing 3 minutes.

### The chat box

**Placement.** A floating **Ask** button, bottom right on every page (above the mobile reservation bar), rendered by
the root layout only when the assistant is on.

**The panel:**
- a full-screen sheet on phones, a 380 × 560 panel on larger screens;
- messages, with the reply appearing as it streams;
- a "Thinking…" note until the first words arrive;
- listing links under a reply;
- a composer: Enter sends, Shift+Enter adds a line;
- a line saying answers come from a local AI model and to check before booking;
- Escape closes the panel, and focus goes to the composer when it opens and back to the button when it closes.

**Behaviour:**
- On a `/rooms/[id]` page, the box sends that listing's id with each question.
- The conversation survives page navigation (the layout stays mounted) but not a reload.
- Replies render as plain text; nothing from the model is rendered as HTML.

### AppHost

- `AddOllama("ollama")`: persistent, with a data volume so the model downloads once;
- the model `assistant-model` (`Assistant:Model`);
- the `assistant` project, referencing the model and waiting for it, with `Assistant__CatalogUrl` = the frontend's
  endpoint;
- the frontend gets `ASSISTANT_HTTP`;
- Open WebUI is left out because the machine's memory is tight (`.WithOpenWebUI()` adds it).

## Testing

- **Assistant service** (no Ollama):
  - a scripted `IChatClient` that answers with tool calls and text, behind the real function-invocation pipeline;
  - a fake catalog handler;
  - streaming events in order, including the listing cards from the last search;
  - each tool's request to the catalog;
  - request validation;
  - the rate limit;
  - a model failure ends with an error event;
  - the system prompt has today's date, the cities, the listing context and the guide.
- **Next:**
  - the listing and quote routes: 404, availability against a booked stay, the price breakdown, bad dates, too many
    guests;
  - `/api/assistant`: mock mode 404, the relay with the browser's IP, the stream passed through;
  - the NDJSON reader, including lines split across chunks;
  - the chat box: open and close, send, streaming text, listing links, the listing context from the URL, errors,
    Escape.
- **AppHost smoke test:** with `--Assistant:Model=qwen2.5:0.5b` (small, so CI's download stays short), a question
  streams some text and ends with `done`. It checks the wiring, not the answer.

## Calls made without asking

- A separate .NET service using Microsoft.Extensions.AI over the Aspire Ollama client integration.
- Tools over Next's public catalog API, including two new routes.
- `qwen2.5:3b` as the default model, CPU unless GPU is opted into; no Open WebUI.
- NDJSON streaming relayed through Next, rather than the gateway.
- No sign-in needed; 10 questions a minute per IP; a 10-message history.
- The guide's content, written from how the app works today.
- Hidden in mock mode; a tiny model in the smoke test.
