import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized, withErrorEnvelope } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { PAYMENT_ERRORS, type PaymentError } from "@/lib/bookings/payment";
import { bookingRefusal, bookingRequestSchema, nightsBetweenDates } from "@/lib/bookings/schemas";
import { HOST_LISTING_ID_PREFIX } from "@/lib/host/options";
import { getRepositories } from "@/lib/repositories";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

export const POST = withErrorEnvelope(async (request: Request) => {
  const user = await sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, bookingRequestSchema);
  if ("error" in body) return body.error;

  const { listingId, checkIn, checkOut, adults, children, card } = body.data;
  const repos = getRepositories();
  const listing = await repos.listings.findById(listingId);
  if (!listing) return jsonError(`Listing '${listingId}' was not found`, 404);
  if (listing.hostId === user.id) return jsonError("You can't book your own listing", 400);
  const refusal = bookingRefusal(listing, adults + children);
  if (refusal) return jsonError(refusal, 400);
  if (!card) return paymentError("invalid_card");

  // Priced here from the listing, never from anything the client sent.
  const priceBreakdown = calculatePriceBreakdown(listing.pricePerNight, nightsBetweenDates(checkIn, checkOut));
  const quote = listing.id.startsWith(HOST_LISTING_ID_PREFIX)
    ? { hostId: listing.hostId, pricePerNight: listing.pricePerNight, maxGuests: listing.maxGuests, title: listing.title }
    : undefined;
  const booking = await repos.bookings.create(
    { id: user.id, name: user.name, email: user.email },
    { listingId, hostId: listing.hostId, checkIn, checkOut, guests: { adults, children }, priceBreakdown },
    quote,
    card,
  );
  if (booking === "unavailable") return jsonError("Those dates were just booked. Pick different dates.", 409);
  if ("paymentError" in booking) return paymentError(booking.paymentError);
  // 202: the payment hasn't settled yet; the trip page shows it as processing.
  return Response.json(ok(booking), { status: booking.status === "pending" ? 202 : 201 });
});

function paymentError(code: PaymentError): Response {
  const { message, status } = PAYMENT_ERRORS[code];
  return jsonError(message, status, code);
}
