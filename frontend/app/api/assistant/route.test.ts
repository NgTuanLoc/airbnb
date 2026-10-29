// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";

const question = { messages: [{ role: "user", text: "Cabins in Aspen?" }], listingId: null };

function ask(cookie?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" };
  if (cookie) headers.cookie = cookie;
  return new Request("http://localhost/api/assistant", { method: "POST", headers, body: JSON.stringify(question) });
}

describe("POST /api/assistant", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://api.test");
    vi.stubEnv("ASSISTANT_HTTP", "http://assistant.test");
    fetchMock = vi.fn(async () =>
      new Response('{"type":"text","text":"Two cabins."}\n{"type":"done"}\n', { headers: { "content-type": "application/x-ndjson" } }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("is 404 in mock mode: the assistant needs the backend", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");

    expect((await POST(ask())).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("is 503 when the assistant isn't configured", async () => {
    vi.stubEnv("ASSISTANT_HTTP", "");

    expect((await POST(ask())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("relays the question with the browser's IP and streams the answer back", async () => {
    const response = await POST(ask("session=tok"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson");
    expect(await response.text()).toBe('{"type":"text","text":"Two cabins."}\n{"type":"done"}\n');
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://assistant.test/ask");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.9");
    // The assistant sees public data only: the session never goes to it.
    expect(headers.get("authorization")).toBeNull();
  });
});
