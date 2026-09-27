import type { Booking } from "@/lib/types";

/** Upcoming trips (check-out today or later) soonest first; past trips most recent first. */
export function splitTrips(bookings: Booking[], today: string): { upcoming: Booking[]; past: Booking[] } {
  const upcoming = bookings.filter((b) => b.checkOut >= today).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const past = bookings.filter((b) => b.checkOut < today).sort((a, b) => b.checkOut.localeCompare(a.checkOut));
  return { upcoming, past };
}
