import type { Booking } from "@/lib/types";

/** Upcoming trips (check-out today or later) soonest first; past trips most recent first. */
export function splitTrips<T extends Booking>(bookings: T[], today: string): { upcoming: T[]; past: T[] } {
  const upcoming = bookings.filter((b) => b.checkOut >= today).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const past = bookings.filter((b) => b.checkOut < today).sort((a, b) => b.checkOut.localeCompare(a.checkOut));
  return { upcoming, past };
}
