import type { Booking } from "@/lib/types";
import type { BookingRepository } from "../booking-repository";

// In memory, per guest id; on globalThis so dev hot reload keeps it. A server restart clears it.
const store: Map<string, Booking[]> = ((globalThis as { __mockBookings?: Map<string, Booking[]> }).__mockBookings ??=
  new Map());

const bookingsOf = (userId: string): Booking[] => store.get(userId) ?? [];
const allBookings = (): Booking[] => [...store.values()].flat();
const today = (): string => new Date().toISOString().slice(0, 10);
const byCheckIn = (a: Booking, b: Booking): number => a.checkIn.localeCompare(b.checkIn);

// Nights are half-open [checkIn, checkOut): one guest's check-out day can be the next guest's check-in day.
function overlaps(a: Pick<Booking, "checkIn" | "checkOut">, b: Pick<Booking, "checkIn" | "checkOut">): boolean {
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

export const mockBookingRepository: BookingRepository = {
  async listForUser(userId) {
    return bookingsOf(userId);
  },

  async findById(userId, id) {
    return allBookings().find((b) => b.id === id && (b.guestId === userId || b.hostId === userId)) ?? null;
  },

  // The quote is unused: the route already priced the booking and set its hostId.
  async create(guest, booking) {
    const taken = allBookings().some((b) => b.status === "confirmed" && b.listingId === booking.listingId && overlaps(b, booking));
    if (taken) return "unavailable";
    const created: Booking = {
      ...booking,
      id: crypto.randomUUID(),
      guestId: guest.id,
      guestName: guest.name,
      guestEmail: guest.email,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    };
    store.set(guest.id, [...bookingsOf(guest.id), created]);
    return created;
  },

  async cancel(userId, id) {
    const booking = bookingsOf(userId).find((b) => b.id === id);
    if (!booking) return "not-found";
    if (booking.status === "cancelled") return booking;
    if (booking.checkIn <= today()) return "started";
    const cancelled: Booking = { ...booking, status: "cancelled", cancelledAt: new Date().toISOString() };
    store.set(userId, bookingsOf(userId).map((b) => (b.id === id ? cancelled : b)));
    return cancelled;
  },

  async listForHost(hostId) {
    return allBookings().filter((b) => b.hostId === hostId).sort(byCheckIn);
  },

  async availability(listingId) {
    return allBookings()
      .filter((b) => b.listingId === listingId && b.status === "confirmed" && b.checkOut > today())
      .sort(byCheckIn)
      .map(({ checkIn, checkOut }) => ({ checkIn, checkOut }));
  },
};
