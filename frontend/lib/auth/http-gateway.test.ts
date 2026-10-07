// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { createHttpAuthGateway } from "./http-gateway";

const base = "http://api.test";
const user = { id: "usr_1", name: "Ana", email: "ana@example.com" };
const session = { user, token: "tok_abc", expiresAt: "2031-01-08T00:00:00Z" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createHttpAuthGateway", () => {
  afterEach(() => vi.restoreAllMocks());

  test("login posts the credentials and the client ip, and returns the session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(200, { success: true, data: session }));

    const result = await createHttpAuthGateway(base).login({ email: "ana@example.com", password: "pw-12345" }, { clientIp: "203.0.113.7" });

    expect(result).toEqual({ ok: true, session });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://api.test/api/auth/login");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "ana@example.com", password: "pw-12345" });
    expect(new Headers(init?.headers).get("x-forwarded-for")).toBe("203.0.113.7");
  });

  test.each([
    [401, "Email or password is incorrect"],
    [409, "An account with that email already exists"],
    [400, "The Password field must be a string or array type with a minimum length of '8'."],
    [429, "Too Many Requests"],
  ])("a %i keeps the backend's status and message", async (status, error) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(status, { success: false, error }));
    const result = await createHttpAuthGateway(base).register({ name: "Ana", email: "ana@example.com", password: "pw-12345" });
    expect(result).toEqual({ ok: false, status, error });
  });

  test("a 500 or an invalid payload throws", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(500, { success: false, error: "An unexpected error occurred" }))
      .mockResolvedValueOnce(json(200, { success: true, data: { token: 1 } }));
    const gateway = createHttpAuthGateway(base);
    await expect(gateway.login({ email: "a@b.co", password: "pw-12345" })).rejects.toThrow("POST /api/auth/login failed with 500");
    await expect(gateway.login({ email: "a@b.co", password: "pw-12345" })).rejects.toThrow("invalid payload");
  });

  test("a token that is not base64url is an invalid payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(200, { success: true, data: { ...session, token: "abc; Domain=evil.example" } }));
    await expect(createHttpAuthGateway(base).login({ email: "a@b.co", password: "pw-12345" })).rejects.toThrow("invalid payload");
  });

  test("me sends the bearer token, returns the user, and null on 401", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(200, { success: true, data: user }))
      .mockResolvedValueOnce(json(401, { success: false, error: "Log in to continue" }));
    const gateway = createHttpAuthGateway(base);

    expect(await gateway.me("tok_abc")).toEqual(user);
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer tok_abc");
    expect(await gateway.me("tok_gone")).toBeNull();
  });

  test("logout posts the bearer token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 204 }));
    await createHttpAuthGateway(base).logout("tok_abc");
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://api.test/api/auth/logout");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer tok_abc");
  });

  test("a network failure throws with the path", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(createHttpAuthGateway(base).me("tok")).rejects.toThrow("GET /api/auth/me failed: fetch failed");
  });
});
