import { describe, expect, test } from "vitest";
import { getRepositories } from "@/lib/repositories";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";
import { GET } from "./route";

const DAY = 86_400_000;
const daysFromToday = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

function quote(id: string, query: Record<string, string | number>) {
  const search = new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]));
  return GET(new Request(`http://localhost/api/listings/${id}/quote?${search}`), { params: Promise.resolve({ id }) });
}

// l3: $180 a night, up to 4 guests (lib/data/listings.ts). Far-apart dates: the mock booking store is shared.
describe("GET /api/listings/[id]/quote", () => {
  test("free dates are available and priced exactly like the booking page", async () => {
    const res = await quote("l3", { checkIn: daysFromToday(400), checkOut: daysFromToday(403), guests: 2 });

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      listingId: "l3",
      checkIn: daysFromToday(400),
      checkOut: daysFromToday(403),
      nights: 3,
      available: true,
      priceBreakdown: calculatePriceBreakdown(180, 3),
    });
  });

  test("dates that overlap a booking aren't available", async () => {
    await getRepositories().bookings.create(
      { id: `u-${crypto.randomUUID()}@example.com`, name: "Quinn", email: "quinn@example.com" },
      { listingId: "l3", hostId: "h3", checkIn: daysFromToday(450), checkOut: daysFromToday(455), guests: { adults: 1, children: 0 }, priceBreakdown: calculatePriceBreakdown(180, 5) },
    );

    const overlapping = await quote("l3", { checkIn: daysFromToday(453), checkOut: daysFromToday(457), guests: 1 });
    const backToBack = await quote("l3", { checkIn: daysFromToday(455), checkOut: daysFromToday(457), guests: 1 });

    expect((await overlapping.json()).data.available).toBe(false);
    expect((await backToBack.json()).data.available).toBe(true);
  });

  test.each([
    [{ checkIn: daysFromToday(-5), checkOut: daysFromToday(2), guests: 1 }, "Check-in can't be in the past"],
    [{ checkIn: daysFromToday(500), checkOut: daysFromToday(500), guests: 1 }, "Check-out must be after check-in"],
    [{ checkIn: daysFromToday(500), checkOut: daysFromToday(531), guests: 1 }, "Stays can be at most 30 nights"],
    [{ checkIn: "2031-02-30", checkOut: daysFromToday(501), guests: 1 }, "Enter a real date"],
    [{ checkIn: daysFromToday(500), checkOut: daysFromToday(502), guests: 5 }, "This place allows at most 4 guests"],
  ])("refuses %o with the booking rules' reason", async (query, message) => {
    const res = await quote("l3", query);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(message);
  });

  test("an unknown listing is 404", async () => {
    const res = await quote("l999", { checkIn: daysFromToday(500), checkOut: daysFromToday(502), guests: 1 });

    expect(res.status).toBe(404);
  });
});
