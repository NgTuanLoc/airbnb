import { describe, expect, test } from "vitest";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";
import { mockBookingRepository as repo } from "./mock-booking-repository";
import type { GuestRef, NewBooking } from "../booking-repository";

const newGuest = (): GuestRef => {
  const id = `u-${crypto.randomUUID()}`;
  return { id, name: "Guest", email: `${id}@example.com` };
};
const newListing = () => `l-test-${crypto.randomUUID()}`;
const DAY = 86_400_000;
const daysFromToday = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

function stay(listingId: string, checkIn: string, checkOut: string, hostId = "host-1"): NewBooking {
  return { listingId, hostId, checkIn, checkOut, guests: { adults: 1, children: 0 }, priceBreakdown: calculatePriceBreakdown(100, 1) };
}

async function book(guest: GuestRef, booking: NewBooking) {
  const created = await repo.create(guest, booking);
  if (created === "unavailable") throw new Error("unexpected");
  return created;
}

describe("mockBookingRepository", () => {
  test("creates a confirmed booking only its guest and host can read", async () => {
    const guest = newGuest();
    const hostId = `u-${crypto.randomUUID()}`;
    const created = await book(guest, stay(newListing(), "2030-01-01", "2030-01-04", hostId));

    expect(created).toMatchObject({ status: "confirmed", guestId: guest.id, guestEmail: guest.email, guestName: guest.name, hostId });
    expect(await repo.findById(guest.id, created.id)).toEqual(created);
    expect(await repo.findById(hostId, created.id)).toEqual(created);
    expect(await repo.findById(newGuest().id, created.id)).toBeNull();
    expect(await repo.listForUser(guest.id)).toEqual([created]);
  });

  test("rejects overlapping nights on the same listing, by any guest", async () => {
    const listing = newListing();
    await repo.create(newGuest(), stay(listing, "2030-02-10", "2030-02-15"));

    expect(await repo.create(newGuest(), stay(listing, "2030-02-14", "2030-02-16"))).toBe("unavailable");
    expect(await repo.create(newGuest(), stay(listing, "2030-02-08", "2030-02-11"))).toBe("unavailable");
  });

  test("allows back-to-back stays and other listings on the same dates", async () => {
    const listing = newListing();
    await repo.create(newGuest(), stay(listing, "2030-03-10", "2030-03-15"));

    expect(await repo.create(newGuest(), stay(listing, "2030-03-15", "2030-03-18"))).not.toBe("unavailable");
    expect(await repo.create(newGuest(), stay(listing, "2030-03-05", "2030-03-10"))).not.toBe("unavailable");
    expect(await repo.create(newGuest(), stay(newListing(), "2030-03-10", "2030-03-15"))).not.toBe("unavailable");
  });

  test("a cancelled booking no longer blocks its nights", async () => {
    const listing = newListing();
    const guest = newGuest();
    const first = await book(guest, stay(listing, daysFromToday(60), daysFromToday(63)));
    await repo.cancel(guest.id, first.id);

    expect(await repo.create(newGuest(), stay(listing, daysFromToday(60), daysFromToday(63)))).not.toBe("unavailable");
  });

  describe("cancel", () => {
    test("another user gets not-found", async () => {
      const guest = newGuest();
      const created = await book(guest, stay(newListing(), daysFromToday(60), daysFromToday(62)));

      expect(await repo.cancel(newGuest().id, created.id)).toBe("not-found");
    });

    test("a check-in on or before today has started", async () => {
      const guest = newGuest();
      const created = await book(guest, stay(newListing(), daysFromToday(0), daysFromToday(2)));

      expect(await repo.cancel(guest.id, created.id)).toBe("started");
    });

    test("cancels a future booking, and cancelling twice returns the cancelled booking", async () => {
      const guest = newGuest();
      const created = await book(guest, stay(newListing(), daysFromToday(60), daysFromToday(62)));

      const cancelled = await repo.cancel(guest.id, created.id);
      expect(cancelled).toMatchObject({ id: created.id, status: "cancelled" });
      expect(await repo.cancel(guest.id, created.id)).toEqual(cancelled);
      expect(await repo.listForUser(guest.id)).toEqual([cancelled]);
    });
  });

  test("availability lists confirmed stays ending after today, by check-in", async () => {
    const listing = newListing();
    const guest = newGuest();
    await book(newGuest(), stay(listing, daysFromToday(80), daysFromToday(82)));
    await book(newGuest(), stay(listing, daysFromToday(70), daysFromToday(72)));
    await book(newGuest(), stay(listing, daysFromToday(-5), daysFromToday(-3)));
    const cancelled = await book(guest, stay(listing, daysFromToday(90), daysFromToday(92)));
    await repo.cancel(guest.id, cancelled.id);

    expect(await repo.availability(listing)).toEqual([
      { checkIn: daysFromToday(70), checkOut: daysFromToday(72) },
      { checkIn: daysFromToday(80), checkOut: daysFromToday(82) },
    ]);
  });

  test("listForHost returns only the host's bookings, soonest first, with the guest's name and email", async () => {
    const hostId = `u-${crypto.randomUUID()}`;
    const early = newGuest();
    const late = newGuest();
    await book(late, stay(newListing(), "2031-05-10", "2031-05-12", hostId));
    await book(early, stay(newListing(), "2031-04-01", "2031-04-03", hostId));
    await book(newGuest(), stay(newListing(), "2031-04-01", "2031-04-03", "someone-else"));

    const result = await repo.listForHost(hostId);

    expect(result.map((b) => [b.guestEmail, b.guestName, b.checkIn])).toEqual([
      [early.email, early.name, "2031-04-01"],
      [late.email, late.name, "2031-05-10"],
    ]);
  });
});
