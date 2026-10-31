import { cookies } from "next/headers";
import { z } from "zod";
import { bookingSchema, envelopeSchema, staySchema } from "@/lib/api-client/schemas";
import { traceHeaders } from "@/lib/api/trace";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { PAYMENT_ERRORS, type PaymentError } from "@/lib/bookings/payment";
import type { Booking, Stay } from "@/lib/types";
import type { BookingRepository } from "../booking-repository";

// The backend charges through the payment service (3 attempts of up to 4 s each) before it answers.
const REQUEST_TIMEOUT_MS = 20_000;

const isPaymentError = (code: string | undefined): code is PaymentError => code !== undefined && Object.hasOwn(PAYMENT_ERRORS, code);

async function sessionToken(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new Error("No session for the bookings API");
  return token;
}

/** One call to the backend's Bookings module; returns the status and the parsed envelope (data validated by `schema`). */
async function call<T extends z.ZodType>(baseUrl: string, method: string, path: string, schema: T, options: { body?: unknown; auth?: boolean; quoteKey?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...traceHeaders() };
  if (options.auth !== false) headers.authorization = `Bearer ${await sessionToken()}`;
  if (options.quoteKey) headers["x-quote-key"] = options.quoteKey;
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
  return {
    status: response.status,
    data: parsed.success ? (parsed.data.data as z.infer<T> | undefined) : undefined,
    code: parsed.success ? parsed.data.code : undefined,
    valid: parsed.success,
  };
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
    async create(_guest, booking, quote, card) {
      const body = {
        listingId: booking.listingId,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        adults: booking.guests.adults,
        children: booking.guests.children,
        quote,
        card,
      };
      // Only this server may vouch for a host-listing quote; the backend refuses quotes without the shared key.
      const quoteKey = process.env.BOOKINGS_QUOTE_KEY;
      if (quote && !quoteKey) throw new Error("BOOKINGS_QUOTE_KEY is required to book host listings");
      const result = await call(baseUrl, "POST", "/api/bookings", bookingSchema, { body, quoteKey: quote ? quoteKey : undefined });
      if (result.status === 409) return "unavailable";
      // 402 is a decline; a 400 with invalid_card is the card, any other 400 a bug and thrown below.
      if ((result.status === 402 || result.status === 400) && isPaymentError(result.code)) return { paymentError: result.code };
      // 201 confirmed, or 202 still pending while the payment settles.
      return expectData(result, "POST", "/api/bookings") as Booking;
    },
    async cancel(_userId, id) {
      const path = `/api/bookings/${encodeURIComponent(id)}/cancel`;
      const result = await call(baseUrl, "POST", path, bookingSchema);
      if (result.status === 404) return "not-found";
      // Only trip_started (or an older backend without codes) means it began; other conflicts are errors.
      if (result.status === 409 && (result.code === undefined || result.code === "trip_started")) return "started";
      return expectData(result, "POST", path) as Booking;
    },
    async availability(listingId) {
      const path = `/api/bookings/availability?listingId=${encodeURIComponent(listingId)}`;
      return expectData(await call(baseUrl, "GET", path, z.array(staySchema), { auth: false }), "GET", path) as Stay[];
    },
  };
}
