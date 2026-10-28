import type { Booking } from "@/lib/types";

const STATUS_LABELS: Record<Booking["status"], string> = {
  confirmed: "Confirmed",
  pending: "Payment processing",
  declined: "Payment declined",
  cancelled: "Cancelled",
};

export function statusLabel(status: Booking["status"]): string {
  return STATUS_LABELS[status];
}

/**
 * Trips (confirmed, or pending while the payment settles) split into upcoming (check-out today or later, soonest
 * first) and past (most recent first); cancelled and declined ones apart.
 */
export function splitTrips<T extends Booking>(bookings: T[], today: string): { upcoming: T[]; past: T[]; cancelled: T[] } {
  const active = bookings.filter((b) => b.status === "confirmed" || b.status === "pending");
  return {
    upcoming: active.filter((b) => b.checkOut >= today).sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    past: active.filter((b) => b.checkOut < today).sort((a, b) => b.checkOut.localeCompare(a.checkOut)),
    cancelled: bookings
      .filter((b) => b.status === "cancelled" || b.status === "declined")
      .sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
  };
}
