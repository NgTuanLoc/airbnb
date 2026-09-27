import type { Booking } from "@/lib/types";
import type { BookingRepository, NewBooking } from "../booking-repository";

// In memory, per user; on globalThis so dev hot reload keeps it. A server restart clears it.
const store: Map<string, Booking[]> = ((globalThis as { __mockBookings?: Map<string, Booking[]> }).__mockBookings ??=
  new Map());

const bookingsOf = (userId: string): Booking[] => store.get(userId) ?? [];

// Nights are half-open [checkIn, checkOut): one guest's check-out day can be the next guest's check-in day.
function overlaps(a: Pick<Booking, "checkIn" | "checkOut">, b: Pick<Booking, "checkIn" | "checkOut">): boolean {
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

export const mockBookingRepository: BookingRepository = {
  async listForUser(userId) {
    return bookingsOf(userId);
  },

  async findById(userId, id) {
    return bookingsOf(userId).find((b) => b.id === id) ?? null;
  },

  async create(userId, booking: NewBooking) {
    const taken = [...store.values()].flat().some((b) => b.listingId === booking.listingId && overlaps(b, booking));
    if (taken) return "unavailable";
    const created: Booking = { ...booking, id: crypto.randomUUID(), status: "confirmed", createdAt: new Date().toISOString() };
    store.set(userId, [...bookingsOf(userId), created]);
    return created;
  },
};
