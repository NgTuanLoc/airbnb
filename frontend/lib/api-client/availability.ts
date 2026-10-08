import { z } from "zod";
import type { Booking, Stay } from "@/lib/types";
import { callApi } from "./request";
import { bookingSchema, staySchema } from "./schemas";

export function fetchAvailability(listingId: string): Promise<Stay[]> {
  return callApi(`/api/listings/${encodeURIComponent(listingId)}/availability`, z.array(staySchema));
}

export function cancelBooking(id: string): Promise<Booking> {
  return callApi(`/api/bookings/${encodeURIComponent(id)}/cancel`, bookingSchema, { method: "POST" });
}
