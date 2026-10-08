import type { Booking } from "@/lib/types";

/** Confirmed trips split into upcoming (check-out today or later, soonest first) and past (most recent first); cancelled ones apart. */
export function splitTrips<T extends Booking>(bookings: T[], today: string): { upcoming: T[]; past: T[]; cancelled: T[] } {
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  return {
    upcoming: confirmed.filter((b) => b.checkOut >= today).sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    past: confirmed.filter((b) => b.checkOut < today).sort((a, b) => b.checkOut.localeCompare(a.checkOut)),
    cancelled: bookings.filter((b) => b.status === "cancelled").sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
  };
}
