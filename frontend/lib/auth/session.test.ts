// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  SESSION_COOKIE,
  clearedSessionCookie,
  decodeSession,
  encodeSession,
  sessionCookie,
  sessionFromRequest,
  userFromCredentials,
} from "./session";

describe("userFromCredentials", () => {
  test("derives a stable id from the email, whatever its case or spacing", () => {
    expect(userFromCredentials("  Ana@Example.COM ").id).toBe("u-ana@example.com");
    expect(userFromCredentials("ana@example.com").id).toBe(userFromCredentials("ANA@example.com").id);
  });

  test("uses the given name, or the part of the email before @", () => {
    expect(userFromCredentials("ana@example.com", " Ana Lima ").name).toBe("Ana Lima");
    expect(userFromCredentials("ana@example.com").name).toBe("ana");
  });
});

describe("session cookie", () => {
  const user = userFromCredentials("ana@example.com", "Ana");

  test("round-trips the user", () => {
    expect(decodeSession(encodeSession(user))).toEqual(user);
  });

  test("a tampered or garbage cookie is logged out", () => {
    expect(decodeSession(undefined)).toBeNull();
    expect(decodeSession("")).toBeNull();
    expect(decodeSession("not-base64-json")).toBeNull();
    expect(decodeSession(encodeSession(user).slice(0, 10))).toBeNull();
    expect(decodeSession(Buffer.from(JSON.stringify({ id: "u-x" })).toString("base64url"))).toBeNull();
  });

  test("sets an httpOnly lax cookie for 7 days and clears it with Max-Age=0", () => {
    expect(sessionCookie(encodeSession(user))).toBe(`${SESSION_COOKIE}=${encodeSession(user)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
    expect(clearedSessionCookie()).toBe(`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  });

  afterEach(() => vi.unstubAllEnvs());

  test("adds Secure to both cookies in production only", () => {
    expect(sessionCookie("tok")).not.toContain("Secure");
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookie("tok")).toMatch(/; Max-Age=604800; Secure$/);
    expect(clearedSessionCookie()).toMatch(/; Max-Age=0; Secure$/);
  });

  test("reads the session from a request's cookie header among other cookies", async () => {
    const request = new Request("http://localhost/", { headers: { cookie: `theme=dark; ${SESSION_COOKIE}=${encodeSession(user)}; x=1` } });
    expect(await sessionFromRequest(request)).toEqual(user);
    expect(await sessionFromRequest(new Request("http://localhost/"))).toBeNull();
  });
});
