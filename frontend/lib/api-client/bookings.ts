import type { BookingRequest } from "@/lib/bookings/schemas";
import type { Booking } from "@/lib/types";
import { callApi } from "./request";
import { bookingSchema } from "./schemas";

export function createBooking(request: BookingRequest): Promise<Booking> {
  return callApi("/api/bookings", bookingSchema, { method: "POST", body: JSON.stringify(request) });
}
