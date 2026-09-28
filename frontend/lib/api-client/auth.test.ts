import { afterEach, expect, test, vi } from "vitest";
import { fetchSession, login, logout, register } from "./auth";

const user = { id: "u-ana@example.com", name: "ana", email: "ana@example.com" };

function mockFetch(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body } as Response);
}

afterEach(() => vi.unstubAllGlobals());

test("fetchSession returns the session user", async () => {
  vi.stubGlobal("fetch", mockFetch({ success: true, data: user }));
  await expect(fetchSession()).resolves.toEqual(user);
});

test("login posts credentials and returns the user", async () => {
  const f = mockFetch({ success: true, data: user });
  vi.stubGlobal("fetch", f);
  await expect(login({ email: "ana@example.com", password: "supersecret" })).resolves.toEqual(user);
  expect(f).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST" }));
});

test("register posts credentials and returns the user", async () => {
  const f = mockFetch({ success: true, data: user });
  vi.stubGlobal("fetch", f);
  await expect(
    register({ email: "ana@example.com", password: "supersecret", confirmPassword: "supersecret", name: "Ana" }),
  ).resolves.toEqual(user);
  expect(f).toHaveBeenCalledWith("/api/auth/register", expect.objectContaining({ method: "POST" }));
});

test("logout posts to the logout endpoint", async () => {
  const f = mockFetch({ success: true, data: null });
  vi.stubGlobal("fetch", f);
  await expect(logout()).resolves.toBeUndefined();
  expect(f).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
});
