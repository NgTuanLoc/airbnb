import { cardOutcome } from "@/lib/bookings/payment";
import type { Booking } from "@/lib/types";
import type { BookingRepository } from "../booking-repository";

// In memory, per guest id; on globalThis so dev hot reload keeps it. A server restart clears it.
const store: Map<string, Booking[]> = ((globalThis as { __mockBookings?: Map<string, Booking[]> }).__mockBookings ??=
  new Map());

const bookingsOf = (userId: string): Booking[] => store.get(userId) ?? [];
const allBookings = (): Booking[] => [...store.values()].flat();
const today = (): string => new Date().toISOString().slice(0, 10);
const holdsNights = (b: Booking): boolean => b.status === "confirmed" || b.status === "pending";
const byCheckIn = (a: Booking, b: Booking): number => a.checkIn.localeCompare(b.checkIn);

// Nights are half-open [checkIn, checkOut): one guest's check-out day can be the next guest's check-in day.
function overlaps(a: Pick<Booking, "checkIn" | "checkOut">, b: Pick<Booking, "checkIn" | "checkOut">): boolean {
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

export const mockBookingRepository: BookingRepository = {
  listForUser(userId) {
    return Promise.resolve(bookingsOf(userId));
  },

  findById(userId, id) {
    return Promise.resolve(allBookings().find((b) => b.id === id && (b.guestId === userId || b.hostId === userId)) ?? null);
  },

  // The quote is unused: the route already priced the booking and set its hostId. Without a card it pays (tests only;
  // the route always sends one). The slow test card stays pending: there's no reconciler here.
  create(guest, booking, _quote, card) {
    const taken = allBookings().some((b) => holdsNights(b) && b.listingId === booking.listingId && overlaps(b, booking));
    if (taken) return Promise.resolve("unavailable");
    const outcome = card ? cardOutcome(card, new Date()) : "succeeded";
    if (outcome !== "succeeded" && outcome !== "pending") return Promise.resolve({ paymentError: outcome });
    const created: Booking = {
      ...booking,
      id: crypto.randomUUID(),
      guestId: guest.id,
      guestName: guest.name,
      guestEmail: guest.email,
      status: outcome === "pending" ? "pending" : "confirmed",
      createdAt: new Date().toISOString(),
    };
    store.set(guest.id, [...bookingsOf(guest.id), created]);
    return Promise.resolve(created);
  },

  cancel(userId, id) {
    const booking = bookingsOf(userId).find((b) => b.id === id);
    if (!booking) return Promise.resolve("not-found");
    if (booking.status === "cancelled") return Promise.resolve(booking);
    if (booking.checkIn <= today()) return Promise.resolve("started");
    const cancelled: Booking = { ...booking, status: "cancelled", cancelledAt: new Date().toISOString() };
    store.set(userId, bookingsOf(userId).map((b) => (b.id === id ? cancelled : b)));
    return Promise.resolve(cancelled);
  },

  listForHost(hostId) {
    return Promise.resolve(allBookings().filter((b) => b.hostId === hostId).sort(byCheckIn));
  },

  availability(listingId) {
    const taken = allBookings()
      .filter((b) => b.listingId === listingId && holdsNights(b) && b.checkOut > today())
      .sort(byCheckIn)
      .map(({ checkIn, checkOut }) => ({ checkIn, checkOut }));
    return Promise.resolve(taken);
  },
};
