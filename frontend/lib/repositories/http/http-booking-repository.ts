import { cookies } from "next/headers";
import { z } from "zod";
import { bookingSchema, envelopeSchema, staySchema } from "@/lib/api-client/schemas";
import { SESSION_COOKIE } from "@/lib/auth/session";
import type { Booking, Stay } from "@/lib/types";
import type { BookingRepository } from "../booking-repository";

const REQUEST_TIMEOUT_MS = 5_000;

async function sessionToken(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Error("No session for the bookings API");
  return token;
}

/** One call to the backend's Bookings module; returns the status and the parsed envelope (data validated by `schema`). */
async function call<T extends z.ZodType>(baseUrl: string, method: string, path: string, schema: T, options: { body?: unknown; auth?: boolean } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.auth !== false) headers.authorization = `Bearer ${await sessionToken()}`;
  let response: Response;
  try {
    response = await fetch(new URL(path, baseUrl), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new Error(`${method} ${path} failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
  const parsed = envelopeSchema(schema).safeParse(await response.json().catch(() => undefined));
  return { status: response.status, data: parsed.success ? (parsed.data.data as z.infer<T> | undefined) : undefined, valid: parsed.success };
}

function expectData<T>(result: { status: number; data: T | undefined; valid: boolean }, method: string, path: string): T {
  if (result.status >= 200 && result.status < 300 && result.valid && result.data !== undefined) return result.data;
  throw new Error(`${method} ${path} failed with ${result.status}`);
}

/** Bookings in the backend (spec §2): the session token from the cookie is the bearer. */
export function createHttpBookingRepository(baseUrl: string): BookingRepository {
  return {
    async listForUser() {
      return expectData(await call(baseUrl, "GET", "/api/bookings/mine", z.array(bookingSchema)), "GET", "/api/bookings/mine") as Booking[];
    },
    async listForHost() {
      return expectData(await call(baseUrl, "GET", "/api/bookings/hosting", z.array(bookingSchema)), "GET", "/api/bookings/hosting") as Booking[];
    },
    async findById(_userId, id) {
      const path = `/api/bookings/${encodeURIComponent(id)}`;
      const result = await call(baseUrl, "GET", path, bookingSchema);
      return result.status === 404 ? null : (expectData(result, "GET", path) as Booking);
    },
    async create(_guest, booking, quote) {
      const body = {
        listingId: booking.listingId,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        adults: booking.guests.adults,
        children: booking.guests.children,
        quote,
      };
      const result = await call(baseUrl, "POST", "/api/bookings", bookingSchema, { body });
      return result.status === 409 ? "unavailable" : (expectData(result, "POST", "/api/bookings") as Booking);
    },
    async cancel(_userId, id) {
      const path = `/api/bookings/${encodeURIComponent(id)}/cancel`;
      const result = await call(baseUrl, "POST", path, bookingSchema);
      if (result.status === 404) return "not-found";
      if (result.status === 409) return "started";
      return expectData(result, "POST", path) as Booking;
    },
    async availability(listingId) {
      const path = `/api/bookings/availability?listingId=${encodeURIComponent(listingId)}`;
      return expectData(await call(baseUrl, "GET", path, z.array(staySchema), { auth: false }), "GET", path) as Stay[];
    },
  };
}
