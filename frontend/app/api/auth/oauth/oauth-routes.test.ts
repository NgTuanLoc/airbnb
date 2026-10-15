// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST as start } from "./start/route";
import { GET as callback } from "../callback/[provider]/route";
import { DELETE as disconnect } from "../connections/[provider]/route";
import { flowCookie } from "@/lib/auth/oauth-flow";
import { jsonRequest } from "@/lib/auth/test-helpers";

const gateway = vi.hoisted(() => ({ startExternal: vi.fn(), completeExternal: vi.fn(), disconnect: vi.fn(), logout: vi.fn() }));
vi.mock("@/lib/auth/gateway", () => ({ getAuthGateway: () => gateway }));

const user = { id: "usr_1", name: "Ana", email: "ana@example.com" };
const session = { user, token: "tok_new", expiresAt: "2031-01-08T00:00:00Z" };
const started = { ok: true, authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=s", flowId: "flow_abc", provider: "google" };

const setCookies = (response: Response) => response.headers.getSetCookie();
const params = (provider: string) => ({ params: Promise.resolve({ provider }) });

function callbackRequest(query: string, flow?: Parameters<typeof flowCookie>[0], extraCookie?: string) {
  const cookies = [flow && flowCookie(flow).split(";")[0], extraCookie].filter(Boolean).join("; ");
  return new Request(`http://localhost/api/auth/callback/google?${query}`, { headers: cookies ? { cookie: cookies } : {} });
}

beforeEach(() => Object.values(gateway).forEach((fn) => fn.mockReset()));
afterEach(() => vi.restoreAllMocks());

describe("POST /api/auth/oauth/start", () => {
  test("returns the provider URL and keeps the flow id and a safe next path in the flow cookie", async () => {
    gateway.startExternal.mockResolvedValueOnce(started);

    const response = await start(jsonRequest("http://localhost/api/auth/oauth/start", "POST", { provider: "google", next: "//evil.com" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { redirectUrl: started.authorizationUrl } });
    expect(gateway.startExternal).toHaveBeenCalledWith({ provider: "google", email: undefined, link: false }, { clientIp: undefined, token: undefined });
    const [cookie] = setCookies(response);
    expect(cookie).toMatch(/^oauth_flow=.+; Path=\/api\/auth; HttpOnly; SameSite=Lax; Max-Age=600$/);
    const value = JSON.parse(Buffer.from(cookie.split(";")[0].split("=")[1], "base64url").toString());
    expect(value).toEqual({ id: "flow_abc", next: "/", intent: "login" });
  });

  test("a connect flow needs a session, sends its token, and comes back to Login & security", async () => {
    expect((await start(jsonRequest("http://localhost/api/auth/oauth/start", "POST", { provider: "google", link: true }))).status).toBe(401);
    expect(gateway.startExternal).not.toHaveBeenCalled();

    gateway.startExternal.mockResolvedValueOnce(started);
    const response = await start(jsonRequest("http://localhost/api/auth/oauth/start", "POST", { provider: "google", link: true, next: "/trips" }, "session=tok_abc"));

    expect(gateway.startExternal).toHaveBeenCalledWith({ provider: "google", email: undefined, link: true }, { clientIp: undefined, token: "tok_abc" });
    const value = JSON.parse(Buffer.from(setCookies(response)[0].split(";")[0].split("=")[1], "base64url").toString());
    expect(value).toEqual({ id: "flow_abc", next: "/account/security", intent: "link" });
  });

  test("a refusal keeps the gateway's status, message and code, and sets no cookie", async () => {
    gateway.startExternal.mockResolvedValueOnce({ ok: false, status: 404, error: "Single sign-on isn't set up for that email's domain.", code: "sso_not_configured" });

    const response = await start(jsonRequest("http://localhost/api/auth/oauth/start", "POST", { provider: "sso", email: "alex@acme.example" }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: "Single sign-on isn't set up for that email's domain.", code: "sso_not_configured" });
    expect(setCookies(response)).toEqual([]);
  });

  test("an invalid email or a non-JSON body is refused before the gateway", async () => {
    expect((await start(jsonRequest("http://localhost/api/auth/oauth/start", "POST", { provider: "sso", email: "nope" }))).status).toBe(400);
    expect((await start(new Request("http://localhost/api/auth/oauth/start", { method: "POST", body: "provider=google" }))).status).toBe(415);
    expect(gateway.startExternal).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/callback/[provider]", () => {
  const login = { id: "flow_abc", next: "/trips", intent: "login" as const };

  test("a sign-in sets the session, clears the flow, revokes the old session and goes to next", async () => {
    gateway.completeExternal.mockResolvedValueOnce({ ok: true, session });
    gateway.logout.mockResolvedValueOnce(undefined);

    const response = await callback(callbackRequest("code=c1&state=s1&iss=https%3A%2F%2Faccounts.google.com", login, "session=tok_old"), params("google"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/trips");
    expect(gateway.completeExternal).toHaveBeenCalledWith(
      { provider: "google", flowId: "flow_abc", state: "s1", code: "c1", iss: "https://accounts.google.com" },
      { clientIp: undefined },
    );
    const cookies = setCookies(response);
    expect(cookies[0]).toMatch(/^oauth_flow=; .*Max-Age=0/);
    expect(cookies[1]).toMatch(/^session=tok_new; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800$/);
    expect(gateway.logout).toHaveBeenCalledWith("tok_old", { clientIp: undefined });
  });

  test("without the flow cookie nothing is redeemed", async () => {
    const response = await callback(callbackRequest("code=c1&state=s1"), params("google"));

    expect(response.headers.get("location")).toBe("/login?error=expired&provider=google");
    expect(gateway.completeExternal).not.toHaveBeenCalled();
  });

  test("a provider error (the person cancelled) lands on the log-in page, keeping next", async () => {
    const response = await callback(callbackRequest("error=access_denied&state=s1", login), params("google"));

    expect(response.headers.get("location")).toBe("/login?error=cancelled&provider=google&next=%2Ftrips");
    expect(setCookies(response)).toEqual([expect.stringMatching(/^oauth_flow=; .*Max-Age=0/)]);
  });

  test("a refusal becomes its code; anything else, or a gateway crash, is a plain failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    gateway.completeExternal
      .mockResolvedValueOnce({ ok: false, status: 409, error: "An account with this email already exists.", code: "account_exists" })
      .mockResolvedValueOnce({ ok: false, status: 400, error: "That sign-in attempt doesn't match.", code: "flow_mismatch" })
      .mockRejectedValueOnce(new Error("POST /api/auth/external/callback failed with 502"));
    const flow = { ...login, next: "/" };

    for (const expected of ["account_exists", "failed", "failed"]) {
      const response = await callback(callbackRequest("code=c1&state=s1", flow), params("google"));
      expect(response.headers.get("location")).toBe(`/login?error=${expected}&provider=google`);
    }
  });

  test("a connect flow returns to Login & security, with what was connected or why not", async () => {
    gateway.completeExternal
      .mockResolvedValueOnce({ ok: true, linked: { provider: "github", email: "ana@example.com" } })
      .mockResolvedValueOnce({ ok: false, status: 409, error: "That account is already connected to another user.", code: "identity_in_use" });
    const link = { id: "flow_abc", next: "/account/security", intent: "link" as const };

    const connected = await callback(callbackRequest("code=c1&state=s1", link), params("github"));
    const refused = await callback(callbackRequest("code=c1&state=s1", link), params("github"));

    expect(connected.headers.get("location")).toBe("/account/security?connected=github");
    expect(setCookies(connected).some((c) => c.startsWith("session="))).toBe(false);
    expect(refused.headers.get("location")).toBe("/account/security?error=identity_in_use&provider=github");
  });

  test("a callback without a code is a failure", async () => {
    const response = await callback(callbackRequest("state=s1", login), params("google"));
    expect(response.headers.get("location")).toBe("/login?error=failed&provider=google&next=%2Ftrips");
  });
});

describe("DELETE /api/auth/connections/[provider]", () => {
  const request = (cookie?: string) => jsonRequest("http://localhost/api/auth/connections/google", "DELETE", undefined, cookie);

  test("needs a session", async () => {
    expect((await disconnect(request(), params("google"))).status).toBe(401);
  });

  test("disconnects through the gateway, or passes its refusal on", async () => {
    gateway.disconnect.mockResolvedValueOnce(null).mockResolvedValueOnce({ ok: false, status: 409, error: "Connect another sign-in method first.", code: "last_login_method" });

    const done = await disconnect(request("session=tok_abc"), params("google"));
    const refused = await disconnect(request("session=tok_abc"), params("google"));

    expect(gateway.disconnect).toHaveBeenCalledWith("tok_abc", "google", { clientIp: undefined });
    expect(await done.json()).toEqual({ success: true, data: null });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ success: false, error: "Connect another sign-in method first.", code: "last_login_method" });
  });
});
