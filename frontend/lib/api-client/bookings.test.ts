import { afterEach, expect, test, vi } from "vitest";
import { createBooking } from "./bookings";
import type { BookingRequest } from "@/lib/bookings/schemas";

const request: BookingRequest = { listingId: "l1", checkIn: "2027-01-01", checkOut: "2027-01-03", adults: 2, children: 0 };
const booking = {
  id: "b1",
  listingId: "l1",
  hostId: "h1",
  guestId: "g1",
  checkIn: "2027-01-01",
  checkOut: "2027-01-03",
  guests: { adults: 2, children: 0 },
  priceBreakdown: { lineItems: [{ label: "2 nights", amount: 400 }], total: 400 },
  status: "confirmed" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

test("createBooking posts the booking request and returns the confirmed booking", async () => {
  const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: booking }) } as Response);
  vi.stubGlobal("fetch", f);
  await expect(createBooking(request)).resolves.toEqual(booking);
  expect(f).toHaveBeenCalledWith("/api/bookings", expect.objectContaining({ method: "POST" }));
});
