import type { CardInput, PaymentError } from "@/lib/bookings/payment";
import type { Booking, Stay } from "@/lib/types";

export interface GuestRef { id: string; name: string; email: string }
/** What the backend can't know about a host listing (they live here); the title travels on with the booking events. */
export interface BookingQuote { hostId: string; pricePerNight: number; maxGuests: number; title?: string }
export type NewBooking = Pick<Booking, "listingId" | "hostId" | "checkIn" | "checkOut" | "guests" | "priceBreakdown">;

export interface BookingRepository {
  listForUser(userId: string): Promise<Booking[]>;
  /** Visible to the booking's guest and host. */
  findById(userId: string, id: string): Promise<Booking | null>;
  /**
   * Books and pays: a confirmed booking, or a pending one while the payment settles. "unavailable" when a pending or
   * confirmed stay of the listing shares a night (half-open [checkIn, checkOut)); paymentError when the card was refused.
   */
  create(guest: GuestRef, booking: NewBooking, quote?: BookingQuote, card?: CardInput): Promise<Booking | "unavailable" | { paymentError: PaymentError }>;
  /** Guest only; "started" once check-in day has come. */
  cancel(userId: string, id: string): Promise<Booking | "not-found" | "started">;
  listForHost(hostId: string): Promise<Booking[]>;
  /** Pending or confirmed stays that end after today, by check-in. */
  availability(listingId: string): Promise<Stay[]>;
}
