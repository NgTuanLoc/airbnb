// @vitest-environment node
import { describe, expect, test } from "vitest";
import { POST } from "./route";
import { jsonRequest, sessionCookieHeader } from "@/lib/auth/test-helpers";
import { userFromCredentials } from "@/lib/auth/session";
import { getRepositories } from "@/lib/repositories";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

const DAY = 86_400_000;
const daysFromToday = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const cancel = (id: string, cookie?: string) =>
  POST(jsonRequest(`http://localhost/api/bookings/${id}/cancel`, "POST", undefined, cookie), { params: Promise.resolve({ id }) });

async function bookFor(email: string, checkIn: string, checkOut: string) {
  const user = userFromCredentials(email);
  const booking = await getRepositories().bookings.create(
    { id: user.id, name: user.name, email: user.email },
    { listingId: `l-test-${crypto.randomUUID()}`, hostId: "h1", checkIn, checkOut, guests: { adults: 1, children: 0 }, priceBreakdown: calculatePriceBreakdown(100, 2) },
  );
  if (booking === "unavailable") throw new Error("unexpected");
  return booking;
}

describe("POST /api/bookings/[id]/cancel", () => {
  test("needs a session", async () => {
    expect((await cancel("x")).status).toBe(401);
  });

  test("an unknown booking is 404", async () => {
    const res = await cancel("nope", sessionCookieHeader());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Booking not found");
  });

  test("a started trip is 409", async () => {
    const email = `guest-${crypto.randomUUID()}@example.com`;
    const booking = await bookFor(email, daysFromToday(0), daysFromToday(2));
    const res = await cancel(booking.id, sessionCookieHeader(email));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("This trip has already started");
  });

  test("returns the cancelled booking", async () => {
    const email = `guest-${crypto.randomUUID()}@example.com`;
    const booking = await bookFor(email, daysFromToday(60), daysFromToday(62));
    const res = await cancel(booking.id, sessionCookieHeader(email));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: booking.id, status: "cancelled" });
  });
});
