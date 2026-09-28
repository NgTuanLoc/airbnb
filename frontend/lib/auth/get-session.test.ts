// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { sessionCookie, userFromCredentials } from "./session";
import { getSession, requireSession } from "./get-session";

const cookieStore = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

describe("getSession", () => {
  test("reads the user from the session cookie", async () => {
    const user = userFromCredentials("ana@example.com", "Ana");
    cookieStore.get.mockReturnValue({ value: sessionCookie(user).split(";")[0].split("=")[1] });
    await expect(getSession()).resolves.toEqual(user);
  });

  test("is null when there is no session cookie", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(getSession()).resolves.toBeNull();
  });
});

describe("requireSession", () => {
  test("returns the user when logged in", async () => {
    const user = userFromCredentials("ana@example.com", "Ana");
    cookieStore.get.mockReturnValue({ value: sessionCookie(user).split(";")[0].split("=")[1] });
    await expect(requireSession("/trips")).resolves.toEqual(user);
  });

  test("redirects to /login?next=<path> when logged out", async () => {
    cookieStore.get.mockReturnValue(undefined);
    redirect.mockClear();
    await requireSession("/trips");
    expect(redirect).toHaveBeenCalledWith("/login?next=%2Ftrips");
  });
});
