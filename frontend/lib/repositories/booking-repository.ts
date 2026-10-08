import type { Booking, Stay } from "@/lib/types";

export interface GuestRef { id: string; name: string; email: string }
export interface BookingQuote { hostId: string; pricePerNight: number; maxGuests: number }
export type NewBooking = Pick<Booking, "listingId" | "hostId" | "checkIn" | "checkOut" | "guests" | "priceBreakdown">;

export interface BookingRepository {
  listForUser(userId: string): Promise<Booking[]>;
  /** Visible to the booking's guest and host. */
  findById(userId: string, id: string): Promise<Booking | null>;
  /** "unavailable" when a confirmed stay of the listing shares a night (half-open [checkIn, checkOut)). */
  create(guest: GuestRef, booking: NewBooking, quote?: BookingQuote): Promise<Booking | "unavailable">;
  /** Guest only; "started" once check-in day has come. */
  cancel(userId: string, id: string): Promise<Booking | "not-found" | "started">;
  listForHost(hostId: string): Promise<Booking[]>;
  /** Confirmed stays that end after today, by check-in. */
  availability(listingId: string): Promise<Stay[]>;
}
