// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

function open(lastEventId?: string): Request {
  const headers: Record<string, string> = { accept: "text/event-stream" };
  if (lastEventId) headers["last-event-id"] = lastEventId;
  return new Request("http://localhost/api/notifications/stream", { headers });
}

describe("GET /api/notifications/stream", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://api.test");
    vi.stubEnv("NOTIFICATIONS_HTTP", "http://notifications.test");
    fetchMock = vi.fn(async () =>
      new Response('event: broadcast\ndata: {"id":1,"text":"Hello"}\nid: 1\n\n', { headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("is 204, which stops EventSource reconnecting, without the notification service", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");

    expect((await GET(open())).status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("relays the service's stream with the browser's Last-Event-ID, never cached or compressed", async () => {
    const response = await GET(open("41"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(await response.text()).toBe('event: broadcast\ndata: {"id":1,"text":"Hello"}\nid: 1\n\n');
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://notifications.test/events");
    expect(new Headers(init.headers).get("last-event-id")).toBe("41");
  });

  test("tells the browser to retry later when the service is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    const response = await GET(open());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("retry: 15000\n\n");
    expect(console.error).toHaveBeenCalled();
  });

  test("tells the browser to retry later when the service refuses", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));

    expect(await (await GET(open())).text()).toBe("retry: 15000\n\n");
  });
});
