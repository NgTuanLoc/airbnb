# Smart chat box (AI assistant) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A chat box on every page where guests ask about places, a specific listing, or how the app works, answered by a local Ollama model through the AppHost integration and grounded by read-only tools over the real catalog.

**Architecture:** A stateless .NET service (`services/assistant`) streams NDJSON answers from `POST /ask`. It uses Microsoft.Extensions.AI's function invocation over the Aspire Ollama client, with tools that call the Next server's public catalog API: search, details, and a new quote route that reuses the booking page's rules. Next relays `POST /api/assistant` with the browser's IP. A client component in the root layout renders the conversation.

**Tech Stack:** .NET 10, Microsoft.Extensions.AI 10.x, CommunityToolkit.Aspire.OllamaSharp / Hosting.Ollama 13.6.1, Next.js 16, Zod, Vitest, xUnit v3.

**Spec:** `docs/superpowers/specs/2026-10-29-assistant-design.md`

## Global Constraints

- Packages: CommunityToolkit.Aspire.Hosting.Ollama and CommunityToolkit.Aspire.OllamaSharp 13.6.1; Microsoft.Extensions.AI 10.x (whatever OllamaSharp's abstractions resolve to); ASP.NET Core packages 10.0.13.
- `POST /ask`: 1–10 messages, last is the user's, each 1–1000 characters, roles `user`/`assistant`; `listingId` matches `^(l\d+|hl-[0-9a-f-]{36})$`; 400 `{ code, error }` otherwise.
- NDJSON events: `text` `{text}`, `listings` `{listings:[{id,title,city,pricePerNight,rating}]}` (≤ 3, from the last search, after the text), `done`, `error` `{message}`.
- Tools: `search_listings` (≤ 5 results), `get_listing`, `quote_stay`; catalog base `Assistant:CatalogUrl`, named HttpClient `catalog`, 10 s per call.
- Limits: `Assistant:QuestionsPerMinute` 10 per forwarded IP (loopback proxies only); `MaximumIterationsPerRequest` 4; `MaxOutputTokens` 400; 2 minutes per answer.
- Model: `Assistant:Model` default `qwen2.5:3b`; `Assistant:Gpu` false by default; smoke test `qwen2.5:0.5b`.
- Frontend: hidden in mock mode; plain-text rendering only; `ASSISTANT_HTTP`; relay timeout 3 minutes.
- Never log question text, answers or tool payloads.

## Review Focus

- A question that makes the model invent a listing or price: tools are the only source, and listing links come from tool results, never from the text (Task 2 `Listing_cards_come_from_the_last_search`).
- A stream that breaks halfway (model or catalog down): it ends with an `error` event, and the box shows it and lets the guest ask again (Task 2 `A_model_failure_ends_with_an_error_event`; Task 3 `shows a failure and lets the guest ask again`).
- Long or abusive input: size limits and the per-IP limit (Task 2 `Bad_requests_are_refused`, `Asking_too_often_is_refused`).
- NDJSON lines split across network chunks (Task 3 `reads events split across chunks`).
- The quote disagreeing with the booking page: the same schema rules and `calculatePriceBreakdown` (Task 1 quote tests).

---

### Task 1: Public catalog routes for one listing and a quote

**Files:** create `frontend/app/api/listings/[id]/route.ts`, `frontend/app/api/listings/[id]/quote/route.ts` (+ tests).

**Produces:** `GET /api/listings/[id]` → envelope Listing or 404; `GET /api/listings/[id]/quote?checkIn&checkOut&guests` → envelope `{ listingId, checkIn, checkOut, nights, available, priceBreakdown }` or 400/404.

- [ ] Failing tests:
  - the listing route: a known id returns the listing, an unknown one 404;
  - the quote route: free dates give `available: true` and the breakdown equal to `calculatePriceBreakdown(price, nights)`;
  - dates overlapping a booking give `available: false`;
  - check-in in the past, check-out before check-in, more than 30 nights, and more guests than allowed are each 400 with the booking rules' message;
  - an unknown listing is 404.
- [ ] Implement with `getRepositories()`, the `bookingRequestSchema` rules and `calculatePriceBreakdown`.
- [ ] `npx vitest run app/api/listings`, lint, tsc: pass. Commit `feat: public routes for one listing and a stay quote`.

### Task 2: The assistant service

**Files:** `services/assistant/` (solution, props, `global.json`), `src/Airbnb.Assistant/` (`Program.cs`, `Ask/AskEndpoint.cs`, `Ask/AskRequest.cs`, `Ask/Prompt.cs`, `Ask/guide.md` embedded, `Tools/CatalogTools.cs`, `Tools/CatalogClient.cs`, `Properties/launchSettings.json` http 5296, `appsettings.json`), `tests/Airbnb.Assistant.Tests/` (`ScriptedChatClient.cs`, `FakeCatalog.cs`, `AssistantFactory.cs`, `AskTests.cs`, `PromptTests.cs`).

**Consumes:** Task 1's routes (through the fake catalog in tests). **Produces:** `POST /ask` per Global Constraints; the connection name `assistant-model`.

- [ ] Failing tests:
  - `Streams_the_answer_as_text_events_then_done`;
  - `A_search_tool_call_reaches_the_catalog_with_the_filters`;
  - `Listing_cards_come_from_the_last_search`;
  - `Quote_and_details_tools_call_the_catalog`;
  - `Bad_requests_are_refused` (theory: no messages, 11 messages, last not the user's, 1001 characters, bad role, bad listing id);
  - `Asking_too_often_is_refused`;
  - `A_model_failure_ends_with_an_error_event`;
  - `The_prompt_has_today_the_cities_the_listing_and_the_guide`.
- [ ] Implement: `AddOllamaApiClient("assistant-model").AddChatClient().UseFunctionInvocation(...)`, tools via `AIFunctionFactory`, NDJSON writer with flush per event, the rate limiter, `UseForwardedHeaders` (loopback).
- [ ] `dotnet test` in `services/assistant`: pass. Commit `feat: add the assistant service`.

### Task 3: The chat box

**Files:** `frontend/app/api/assistant/route.ts` (+ test), `frontend/lib/assistant/client.ts` + `schemas.ts` + `config.ts` (+ tests), `frontend/components/features/assistant/assistant-chat-box.tsx` (+ test), `frontend/app/layout.tsx`.

**Consumes:** Task 2's endpoint and events.

- [ ] Failing tests:
  - route: 404 in mock mode; 503 without `ASSISTANT_HTTP`; relays the body with the browser's IP and streams back;
  - client: `askAssistant` yields events, `reads events split across chunks`, and rejects on a non-200;
  - chat box: opens and closes (Escape, focus back), sends the conversation with the listing id from `/rooms/[id]`, shows streamed text, `Thinking…`, listing links, `shows a failure and lets the guest ask again`;
  - layout: the box only when the assistant is on.
- [ ] Implement.
- [ ] `npm test`, lint, tsc: pass. Commit `feat: a smart chat box on every page`.

### Task 4: AppHost, smoke test, CI, docs

**Files:** `backend/Directory.Packages.props`, AppHost csproj + `AppHost.cs`, `AppHostSmokeTests.cs`, `.github/workflows/ci.yml`, `README.md`, `CLAUDE.md`.

- [ ] AppHost: Ollama (persistent, data volume, GPU when `Assistant:Gpu`), model `assistant-model` from `Assistant:Model`, the `assistant` project (reference + wait for the model, `Assistant__CatalogUrl` = frontend endpoint), `ASSISTANT_HTTP` on the frontend.
- [ ] Smoke test: started with `--Assistant:Model=qwen2.5:0.5b`; `A_question_streams_an_answer` posts to the frontend's `/api/assistant` and reads text events then `done`.
- [ ] CI `assistant` job; README and CLAUDE.md; hands-on under `aspire run` with `qwen2.5:3b`: the three kinds of question.
- [ ] Commit `feat: run the assistant on Ollama in the AppHost`.
