import { describe, expect, test } from "vitest";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";
import { mockBookingRepository as repo } from "./mock-booking-repository";
import type { NewBooking } from "../booking-repository";

const newUser = () => `u-${crypto.randomUUID()}`;
const newListing = () => `l-test-${crypto.randomUUID()}`;

function stay(listingId: string, checkIn: string, checkOut: string): NewBooking {
  return { listingId, checkIn, checkOut, guests: { adults: 1, children: 0 }, priceBreakdown: calculatePriceBreakdown(100, 1) };
}

describe("mockBookingRepository", () => {
  test("creates a confirmed booking only its guest can read", async () => {
    const guest = newUser();
    const created = await repo.create(guest, stay(newListing(), "2030-01-01", "2030-01-04"));

    expect(created).toMatchObject({ status: "confirmed" });
    if (created === "unavailable") throw new Error("unexpected");
    expect(await repo.findById(guest, created.id)).toEqual(created);
    expect(await repo.findById(newUser(), created.id)).toBeNull();
    expect(await repo.listForUser(guest)).toEqual([created]);
  });

  test("rejects overlapping nights on the same listing, by any guest", async () => {
    const listing = newListing();
    await repo.create(newUser(), stay(listing, "2030-02-10", "2030-02-15"));

    expect(await repo.create(newUser(), stay(listing, "2030-02-14", "2030-02-16"))).toBe("unavailable");
    expect(await repo.create(newUser(), stay(listing, "2030-02-08", "2030-02-11"))).toBe("unavailable");
  });

  test("allows back-to-back stays and other listings on the same dates", async () => {
    const listing = newListing();
    await repo.create(newUser(), stay(listing, "2030-03-10", "2030-03-15"));

    expect(await repo.create(newUser(), stay(listing, "2030-03-15", "2030-03-18"))).not.toBe("unavailable");
    expect(await repo.create(newUser(), stay(listing, "2030-03-05", "2030-03-10"))).not.toBe("unavailable");
    expect(await repo.create(newUser(), stay(newListing(), "2030-03-10", "2030-03-15"))).not.toBe("unavailable");
  });
});
