// @vitest-environment node
import { describe, expect, test } from "vitest";
import { POST } from "./route";
import { jsonRequest, sessionCookieHeader } from "@/lib/auth/test-helpers";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";
import { listings } from "@/lib/data/listings";

const url = "http://localhost/api/bookings";
const DAY = 86_400_000;
const daysFromToday = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
// l1 in the mock data; each test books its own far-apart dates, since bookings are shared across users.
const l1 = listings.find((l) => l.id === "l1")!;

function book(body: Record<string, unknown>, ...rest: (string | undefined)[]) {
  const cookie = rest.length > 0 ? rest[0] : sessionCookieHeader();
  return POST(jsonRequest(url, "POST", body, cookie));
}

describe("POST /api/bookings", () => {
  test("needs a session", async () => {
    expect((await book({}, undefined)).status).toBe(401);
  });

  test("computes the price on the server and ignores a client total", async () => {
    const res = await book({ listingId: "l1", checkIn: daysFromToday(100), checkOut: daysFromToday(103), adults: 2, children: 0, total: 1 });

    expect(res.status).toBe(201);
    const booking = (await res.json()).data;
    expect(booking).toMatchObject({ listingId: "l1", status: "confirmed", guests: { adults: 2, children: 0 } });
    expect(booking.priceBreakdown).toEqual(calculatePriceBreakdown(l1.pricePerNight, 3));
  });

  test.each([
    [{ checkIn: daysFromToday(-5), checkOut: daysFromToday(2) }, "Check-in can't be in the past"],
    [{ checkIn: daysFromToday(120), checkOut: daysFromToday(120) }, "Check-out must be after check-in"],
    [{ checkIn: daysFromToday(120), checkOut: daysFromToday(151) }, "Stays can be at most 30 nights"],
    [{ checkIn: daysFromToday(120), checkOut: daysFromToday(121), adults: 0 }, "At least 1 adult is required"],
  ])("rejects %o with 400", async (override, message) => {
    const res = await book({ listingId: "l1", adults: 1, ...override });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(message);
  });

  test("rejects more guests than the listing allows", async () => {
    const res = await book({ listingId: "l1", checkIn: daysFromToday(130), checkOut: daysFromToday(131), adults: l1.maxGuests, children: 1 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(`This place allows at most ${l1.maxGuests} guests`);
  });

  test("an unknown listing is 404", async () => {
    const res = await book({ listingId: "l999", checkIn: daysFromToday(140), checkOut: daysFromToday(141), adults: 1 });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Listing 'l999' was not found");
  });

  test("overlapping dates get 409", async () => {
    await book({ listingId: "l1", checkIn: daysFromToday(200), checkOut: daysFromToday(205), adults: 1 });

    const res = await book({ listingId: "l1", checkIn: daysFromToday(203), checkOut: daysFromToday(207), adults: 1 });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Those dates are no longer available");
  });
});
