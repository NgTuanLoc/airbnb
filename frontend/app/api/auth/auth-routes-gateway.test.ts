// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST as login } from "./login/route";
import { POST as register } from "./register/route";
import { POST as logout } from "./logout/route";
import { GET as session } from "./session/route";
import { jsonRequest } from "@/lib/auth/test-helpers";

const gateway = vi.hoisted(() => ({ register: vi.fn(), login: vi.fn(), logout: vi.fn(), me: vi.fn() }));
vi.mock("@/lib/auth/gateway", () => ({ getAuthGateway: () => gateway }));

const user = { id: "usr_1", name: "Ana", email: "ana@example.com" };
const okSession = { ok: true, session: { user, token: "tok_abc", expiresAt: "2031-01-08T00:00:00Z" } };

describe("auth routes over the gateway", () => {
  beforeEach(() => Object.values(gateway).forEach((fn) => fn.mockReset()));
  afterEach(() => vi.restoreAllMocks());

  test("login sets the cookie to the gateway token and returns the user", async () => {
    gateway.login.mockResolvedValueOnce(okSession);
    const response = await login(jsonRequest("http://localhost/api/auth/login", "POST", { email: "ana@example.com", password: "pw-12345" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: user });
    expect(response.headers.get("set-cookie")).toMatch(/^session=tok_abc; Path=\/; HttpOnly; SameSite=Lax; Max-Age=604800$/);
  });

  test("a refused login keeps the gateway's status and message and sets no cookie", async () => {
    gateway.login.mockResolvedValueOnce({ ok: false, status: 401, error: "Email or password is incorrect" });
    const response = await login(jsonRequest("http://localhost/api/auth/login", "POST", { email: "ana@example.com", password: "pw-12345" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: "Email or password is incorrect" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("register sends name, email and password only, and answers 201", async () => {
    gateway.register.mockResolvedValueOnce(okSession);
    const response = await register(jsonRequest("http://localhost/api/auth/register", "POST",
      { name: "Ana", email: "ana@example.com", password: "pw-12345", confirmPassword: "pw-12345" }));
    expect(response.status).toBe(201);
    expect(gateway.register.mock.calls[0][0]).toEqual({ name: "Ana", email: "ana@example.com", password: "pw-12345" });
  });

  test("logout revokes the cookie's token and clears the cookie", async () => {
    gateway.logout.mockResolvedValueOnce(undefined);
    const response = await logout(jsonRequest("http://localhost/api/auth/logout", "POST", undefined, "session=tok_abc"));
    expect(gateway.logout).toHaveBeenCalledWith("tok_abc");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("logout still clears the cookie when the backend is down", async () => {
    gateway.logout.mockRejectedValueOnce(new Error("GET /api/auth/logout failed: fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await logout(jsonRequest("http://localhost/api/auth/logout", "POST", undefined, "session=tok_abc"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("session reads the user through the gateway, and a backend outage reads as logged out", async () => {
    gateway.me.mockResolvedValueOnce(user).mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const request = () => new Request("http://localhost/api/auth/session", { headers: { cookie: "session=tok_abc" } });
    expect(await (await session(request())).json()).toEqual({ success: true, data: user });
    expect(await (await session(request())).json()).toEqual({ success: true, data: null });
  });
});
