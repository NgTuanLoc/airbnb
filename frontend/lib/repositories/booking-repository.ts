import type { Booking } from "@/lib/types";

export type NewBooking = Omit<Booking, "id" | "status" | "createdAt">;

export interface BookingRepository {
  listForUser(userId: string): Promise<Booking[]>;
  findById(userId: string, id: string): Promise<Booking | null>;
  /** "unavailable" when the nights [checkIn, checkOut) overlap another booking of the same listing, by any guest. */
  create(userId: string, booking: NewBooking): Promise<Booking | "unavailable">;
}
