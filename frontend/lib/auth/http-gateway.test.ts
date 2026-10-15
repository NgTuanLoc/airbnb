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

  test("me and logout forward the client ip, and logout throws on a non-2xx answer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(200, { success: true, data: user }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(429, { success: false, error: "Too Many Requests" }));
    const gateway = createHttpAuthGateway(base);
    const context = { clientIp: "203.0.113.7" };

    await gateway.me("tok_abc", context);
    await gateway.logout("tok_abc", context);
    await expect(gateway.logout("tok_abc", context)).rejects.toThrow("POST /api/auth/logout failed with 429");

    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("x-forwarded-for")).toBe("203.0.113.7");
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("x-forwarded-for")).toBe("203.0.113.7");
  });

  test("a 429 with the throttle message reaches the caller", async () => {
    const error = "Too many failed attempts. Try again in a few minutes.";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(429, { success: false, error }));
    expect(await createHttpAuthGateway(base).login({ email: "a@b.co", password: "pw-12345" })).toEqual({ ok: false, status: 429, error });
  });

  test("a network failure throws with the path", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(createHttpAuthGateway(base).me("tok")).rejects.toThrow("GET /api/auth/me failed: fetch failed");
  });
});

describe("createHttpAuthGateway: external sign-in", () => {
  afterEach(() => vi.restoreAllMocks());

  const started = { authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x", flowId: "flow_abc", provider: "google", expiresAt: "2031-01-01T00:10:00Z" };

  test("providers reads the enabled buttons", async () => {
    const providers = { social: [{ id: "google", name: "Google" }], sso: true };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(200, { success: true, data: providers }));
    expect(await createHttpAuthGateway(base).providers()).toEqual(providers);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://api.test/api/auth/providers");
  });

  test("startExternal posts the provider, sends the bearer only for a connect flow, and returns the flow", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(200, { success: true, data: started }))
      .mockResolvedValueOnce(json(200, { success: true, data: started }));
    const gateway = createHttpAuthGateway(base);

    expect(await gateway.startExternal({ provider: "google" }, { clientIp: "203.0.113.7" })).toEqual({
      ok: true, authorizationUrl: started.authorizationUrl, flowId: "flow_abc", provider: "google",
    });
    await gateway.startExternal({ provider: "google", link: true }, { token: "tok_abc" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://api.test/api/auth/external/start");
    expect(JSON.parse(String(init?.body))).toEqual({ provider: "google" });
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
    expect(new Headers(init?.headers).get("x-forwarded-for")).toBe("203.0.113.7");
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("authorization")).toBe("Bearer tok_abc");
  });

  test("a start refusal keeps its status, message and code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(404, { success: false, error: "Single sign-on isn't set up for that email's domain.", code: "sso_not_configured" }));
    expect(await createHttpAuthGateway(base).startExternal({ provider: "sso", email: "a@b.co" })).toEqual({
      ok: false, status: 404, error: "Single sign-on isn't set up for that email's domain.", code: "sso_not_configured",
    });
  });

  test("an authorization URL that isn't http(s) is an invalid payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(200, { success: true, data: { ...started, authorizationUrl: "javascript:alert(1)" } }));
    await expect(createHttpAuthGateway(base).startExternal({ provider: "google" })).rejects.toThrow("invalid payload");
  });

  test("completeExternal returns a session for a sign-in and the connection for a connect flow", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(200, { success: true, data: { session } }))
      .mockResolvedValueOnce(json(200, { success: true, data: { linked: { provider: "github", email: "ana@example.com" } } }));
    const gateway = createHttpAuthGateway(base);
    const input = { provider: "google", flowId: "flow_abc", state: "st", code: "co" };

    expect(await gateway.completeExternal(input)).toEqual({ ok: true, session });
    expect(await gateway.completeExternal(input)).toEqual({ ok: true, linked: { provider: "github", email: "ana@example.com" } });
  });

  test("a refused callback keeps its code, and a provider outage (502) throws", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(409, { success: false, error: "An account with this email already exists.", code: "account_exists" }))
      .mockResolvedValueOnce(json(502, { success: false, error: "The sign-in provider couldn't be reached. Try again.", code: "provider_unreachable" }));
    const gateway = createHttpAuthGateway(base);
    const input = { provider: "google", flowId: "flow_abc", state: "st", code: "co" };

    expect(await gateway.completeExternal(input)).toMatchObject({ ok: false, status: 409, code: "account_exists" });
    await expect(gateway.completeExternal(input)).rejects.toThrow("POST /api/auth/external/callback failed with 502");
  });

  test("connections is null when the session is gone", async () => {
    const info = { hasPassword: false, connections: [{ provider: "google", name: "Google", kind: "social", email: "ana@example.com", connectedAt: "2031-01-01T00:00:00Z" }] };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json(200, { success: true, data: info }))
      .mockResolvedValueOnce(json(401, { success: false, error: "Log in to continue" }));
    const gateway = createHttpAuthGateway(base);
    expect(await gateway.connections("tok_abc")).toEqual(info);
    expect(await gateway.connections("tok_gone")).toBeNull();
  });

  test("disconnect is null on 204, a refusal on 409, and throws on a 500", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json(409, { success: false, error: "Connect another sign-in method first.", code: "last_login_method" }))
      .mockResolvedValueOnce(json(500, { success: false, error: "An unexpected error occurred." }));
    const gateway = createHttpAuthGateway(base);

    expect(await gateway.disconnect("tok_abc", "sso-acme")).toBeNull();
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://api.test/api/auth/connections/sso-acme");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
    expect(await gateway.disconnect("tok_abc", "google")).toMatchObject({ ok: false, status: 409, code: "last_login_method" });
    await expect(gateway.disconnect("tok_abc", "google")).rejects.toThrow("DELETE /api/auth/connections/google failed with 500");
  });
});
