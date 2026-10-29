// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const HUB_URL = "http://gateway.test/chat/hub";

function tokenRequest(cookie?: string): Request {
  return new Request("http://localhost/api/chat/token", { headers: cookie ? { cookie } : {} });
}

describe("GET /api/chat/token", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://api.test");
    vi.stubEnv("CHAT_HUB_URL", HUB_URL);
    fetchMock = vi.fn(async () => Response.json({ success: true, data: { token: "jwt", expiresAt: "2030-01-01T00:10:00Z" } }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("needs a session", async () => {
    const response = await GET(tokenRequest());

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("is 404 in mock mode: chat needs the backend", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");

    expect((await GET(tokenRequest("session=tok"))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("trades the session for a chat token and says where the hub is", async () => {
    const response = await GET(tokenRequest("session=tok"));

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ token: "jwt", expiresAt: "2030-01-01T00:10:00Z", hubUrl: HUB_URL });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://api.test/api/auth/chat-token");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
  });

  test("a session the backend refuses is 401", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ success: false, error: "Log in to continue" }, { status: 401 }));

    expect((await GET(tokenRequest("session=expired"))).status).toBe(401);
  });

  test("is 404 when the backend has chat off", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));

    expect((await GET(tokenRequest("session=tok"))).status).toBe(404);
  });

  test("is 503 when the hub's address isn't configured", async () => {
    vi.stubEnv("CHAT_HUB_URL", "");

    expect((await GET(tokenRequest("session=tok"))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
