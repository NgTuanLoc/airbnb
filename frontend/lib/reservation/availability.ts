import type { Stay } from "@/lib/types";

/** True when the night starting on `iso` (YYYY-MM-DD) belongs to a booked stay; stays are half-open [checkIn, checkOut). */
export function isNightBooked(iso: string, stays: Stay[]): boolean {
  return stays.some((stay) => stay.checkIn <= iso && iso < stay.checkOut);
}

/** True when no night of [checkIn, checkOut) is booked; checking out on another stay's check-in day is fine. */
export function isStayFree(checkIn: string, checkOut: string, stays: Stay[]): boolean {
  return stays.every((stay) => checkOut <= stay.checkIn || stay.checkOut <= checkIn);
}
