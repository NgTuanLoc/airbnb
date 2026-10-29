// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { askAssistant } from "./client";
import type { AssistantEvent } from "./schemas";

// A streamed body delivered in exactly these chunks, the way the network may split it.
function streamed(chunks: string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson" }, ...init });
}

async function collect(response: Response): Promise<AssistantEvent[]> {
  vi.stubGlobal("fetch", vi.fn(async () => response));
  const events: AssistantEvent[] = [];
  await askAssistant({ messages: [{ role: "user", text: "Hi" }], listingId: null }, (event) => events.push(event));
  return events;
}

afterEach(() => vi.unstubAllGlobals());

describe("askAssistant", () => {
  test("posts the question and hands over each event", async () => {
    const fetchMock = vi.fn(async () => streamed(['{"type":"text","text":"Hello"}\n{"type":"done"}\n']));
    vi.stubGlobal("fetch", fetchMock);
    const events: AssistantEvent[] = [];

    await askAssistant({ messages: [{ role: "user", text: "Hi" }], listingId: "l13" }, (event) => events.push(event));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/assistant");
    expect(JSON.parse(init.body as string)).toEqual({ messages: [{ role: "user", text: "Hi" }], listingId: "l13" });
    expect(events).toEqual([{ type: "text", text: "Hello" }, { type: "done" }]);
  });

  test("reads events split across chunks", async () => {
    const events = await collect(streamed(['{"type":"te', 'xt","text":"Two"}\n{"type":"text",', '"text":" cabins"}\n{"type":"listings","listings":[{"id":"l13","title":"Pine cabin","city":"Aspen","pricePerNight":180,"rating":4.8}]}\n{"type":"done"}']));

    expect(events).toEqual([
      { type: "text", text: "Two" },
      { type: "text", text: " cabins" },
      { type: "listings", listings: [{ id: "l13", title: "Pine cabin", city: "Aspen", pricePerNight: 180, rating: 4.8 }] },
      { type: "done" },
    ]);
  });

  test("skips a line it doesn't understand", async () => {
    const events = await collect(streamed(['{"type":"surprise"}\nnot json\n{"type":"done"}\n']));

    expect(events).toEqual([{ type: "done" }]);
  });

  test("a refused question rejects with the reason", async () => {
    await expect(collect(Response.json({ success: false, error: "Messaging needs the backend" }, { status: 404 }))).rejects.toThrow(
      "Messaging needs the backend",
    );
    await expect(collect(new Response(null, { status: 429 }))).rejects.toThrow("You're asking quickly. Wait a minute and try again.");
  });
});
