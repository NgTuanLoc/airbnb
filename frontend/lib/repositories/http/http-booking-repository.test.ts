// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const store = vi.hoisted(() => ({ token: "tok_abc" as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "session" && store.token ? { value: store.token } : undefined) }),
}));

import { createHttpBookingRepository } from "./http-booking-repository";

const BASE = "http://backend.test";
const repo = createHttpBookingRepository(BASE);
const booking = {
  id: "bk_1", listingId: "l1", hostId: "h1", guestId: "g1", guestName: "Ana", guestEmail: "ana@example.com",
  checkIn: "2030-01-01", checkOut: "2030-01-03", guests: { adults: 2, children: 0 },
  priceBreakdown: { lineItems: [{ label: "2 nights", amount: 200 }], total: 200 }, status: "confirmed", createdAt: "2026-01-01T00:00:00Z",
};
const guest = { id: "g1", name: "Ana", email: "ana@example.com" };
const input = {
  listingId: "hl-1", hostId: "h1", checkIn: "2030-01-01", checkOut: "2030-01-03",
  guests: { adults: 2, children: 1 }, priceBreakdown: booking.priceBreakdown,
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const okReply = (data: unknown, status = 200) => reply(status, { success: true, data });

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  store.token = "tok_abc";
  fetchSpy = vi.spyOn(globalThis, "fetch");
});
afterEach(() => vi.restoreAllMocks());

const lastCall = () => {
  const [url, init] = fetchSpy.mock.calls.at(-1)!;
  return { url: String(url), init: init as RequestInit };
};

describe("createHttpBookingRepository", () => {
  test("listForUser and listForHost call mine and hosting with the bearer", async () => {
    fetchSpy.mockResolvedValueOnce(okReply([booking])).mockResolvedValueOnce(okReply([booking]));

    expect(await repo.listForUser("g1")).toEqual([booking]);
    expect(lastCall().url).toBe(`${BASE}/api/bookings/mine`);
    expect(lastCall().init.headers).toMatchObject({ authorization: "Bearer tok_abc" });
    expect(await repo.listForHost("h1")).toEqual([booking]);
    expect(lastCall().url).toBe(`${BASE}/api/bookings/hosting`);
  });

  test("findById maps 404 to null", async () => {
    fetchSpy.mockResolvedValueOnce(okReply(booking)).mockResolvedValueOnce(reply(404, { success: false, error: "Booking not found" }));

    expect(await repo.findById("g1", "bk_1")).toEqual(booking);
    expect(lastCall().url).toBe(`${BASE}/api/bookings/bk_1`);
    expect(await repo.findById("g1", "bk_2")).toBeNull();
  });

  test("create posts the request with the quote and maps 201 and 409", async () => {
    const quote = { hostId: "h1", pricePerNight: 100, maxGuests: 4 };
    fetchSpy.mockResolvedValueOnce(okReply(booking, 201)).mockResolvedValueOnce(reply(409, { success: false, error: "taken" }));

    expect(await repo.create(guest, input, quote)).toEqual(booking);
    expect(lastCall().url).toBe(`${BASE}/api/bookings`);
    expect(lastCall().init.method).toBe("POST");
    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      listingId: "hl-1", checkIn: "2030-01-01", checkOut: "2030-01-03", adults: 2, children: 1, quote,
    });
    expect(await repo.create(guest, input)).toBe("unavailable");
  });

  test("cancel maps 200, 404 and 409", async () => {
    const cancelled = { ...booking, status: "cancelled", cancelledAt: "2026-02-01T00:00:00Z" };
    fetchSpy
      .mockResolvedValueOnce(okReply(cancelled))
      .mockResolvedValueOnce(reply(404, { success: false, error: "x" }))
      .mockResolvedValueOnce(reply(409, { success: false, error: "y" }));

    expect(await repo.cancel("g1", "bk_1")).toEqual(cancelled);
    expect(lastCall().url).toBe(`${BASE}/api/bookings/bk_1/cancel`);
    expect(await repo.cancel("g1", "bk_1")).toBe("not-found");
    expect(await repo.cancel("g1", "bk_1")).toBe("started");
  });

  test("availability needs no auth", async () => {
    store.token = undefined;
    const stays = [{ checkIn: "2030-01-01", checkOut: "2030-01-03" }];
    fetchSpy.mockResolvedValueOnce(okReply(stays));

    expect(await repo.availability("l1")).toEqual(stays);
    expect(lastCall().url).toBe(`${BASE}/api/bookings/availability?listingId=l1`);
    expect(lastCall().init.headers).not.toHaveProperty("authorization");
  });

  test("a 500 or an invalid payload throws", async () => {
    fetchSpy.mockResolvedValueOnce(reply(500, { success: false, error: "boom" })).mockResolvedValueOnce(okReply([{ id: 1 }]));

    await expect(repo.listForUser("g1")).rejects.toThrow("failed with 500");
    await expect(repo.listForUser("g1")).rejects.toThrow("failed with 200");
  });

  test("without a session cookie every call but availability throws", async () => {
    store.token = undefined;

    for (const call of [
      () => repo.listForUser("g1"), () => repo.listForHost("h1"), () => repo.findById("g1", "x"),
      () => repo.create(guest, input), () => repo.cancel("g1", "x"),
    ]) {
      await expect(call()).rejects.toThrow("No session for the bookings API");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
