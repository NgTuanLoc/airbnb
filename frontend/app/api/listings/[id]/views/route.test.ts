// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function ping(cookie?: string): Request {
  const headers: Record<string, string> = { "x-forwarded-for": "203.0.113.7" };
  if (cookie) headers.cookie = cookie;
  return new Request("http://localhost/api/listings/l1/views", { method: "POST", headers });
}

describe("POST /api/listings/[id]/views", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => Response.json({ success: true }, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("is a no-op in mock mode", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");

    const response = await POST(ping(), params("l1"));

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("relays the view with the browser's IP and no session token", async () => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://api.test");

    const response = await POST(ping("session=tok"), params("l1"));

    expect(response.status).toBe(202);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://api.test/api/listings/l1/views");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(headers.get("authorization")).toBeNull();
  });

  test.each(["..", "not-a-listing", "l1/../../auth/logout"])("refuses %j without calling the backend", async (id) => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://api.test");

    const response = await POST(ping(), params(id));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
