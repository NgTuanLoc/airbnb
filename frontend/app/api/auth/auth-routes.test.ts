// @vitest-environment node
import { describe, expect, test } from "vitest";
import { POST as login } from "./login/route";
import { POST as register } from "./register/route";
import { POST as logout } from "./logout/route";
import { GET as session } from "./session/route";
import { SESSION_COOKIE, decodeSession } from "@/lib/auth/session";
import { jsonRequest, sessionCookieHeader } from "@/lib/auth/test-helpers";

function sessionFrom(res: Response) {
  const first = (res.headers.get("set-cookie") ?? "").split(";")[0];
  return decodeSession(first.slice(SESSION_COOKIE.length + 1));
}

describe("POST /api/auth/login", () => {
  test("logs in with any valid email and password and sets the session cookie", async () => {
    const res = await login(jsonRequest("http://localhost/api/auth/login", "POST", { email: "Ana@Example.com", password: "supersecret" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: "u-ana@example.com", name: "ana", email: "ana@example.com" });
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    expect(sessionFrom(res)).toEqual(body.data);
  });

  test("rejects an invalid email with the 400 envelope and no cookie", async () => {
    const res = await login(jsonRequest("http://localhost/api/auth/login", "POST", { email: "nope", password: "supersecret" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: "Enter a valid email address" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("rejects a body that isn't JSON", async () => {
    const res = await login(jsonRequest("http://localhost/api/auth/login", "POST", "{not json"));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Request body must be JSON");
  });
});

describe("POST /api/auth/register", () => {
  test("creates the session with the given name", async () => {
    const res = await register(jsonRequest("http://localhost/api/auth/register", "POST", {
      name: " Ana Lima ", email: "ana@example.com", password: "supersecret", confirmPassword: "supersecret",
    }));

    expect(res.status).toBe(201);
    expect(sessionFrom(res)?.name).toBe("Ana Lima");
  });

  test("rejects mismatched passwords", async () => {
    const res = await register(jsonRequest("http://localhost/api/auth/register", "POST", {
      name: "Ana", email: "ana@example.com", password: "supersecret", confirmPassword: "different1",
    }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Passwords do not match");
  });
});

test("POST /api/auth/logout clears the cookie", async () => {
  const res = await logout();

  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie")).toBe(`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
});

describe("GET /api/auth/session", () => {
  test("returns the logged-in user", async () => {
    const res = await session(new Request("http://localhost/api/auth/session", { headers: { cookie: sessionCookieHeader("ana@example.com") } }));
    expect((await res.json()).data.id).toBe("u-ana@example.com");
  });

  test("returns null when logged out or the cookie is garbage", async () => {
    expect((await (await session(new Request("http://localhost/api/auth/session"))).json()).data).toBeNull();
    const garbage = new Request("http://localhost/api/auth/session", { headers: { cookie: `${SESSION_COOKIE}=%%%` } });
    expect((await (await session(garbage)).json()).data).toBeNull();
  });
});
