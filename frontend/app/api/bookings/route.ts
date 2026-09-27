import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { bookingRequestSchema, nightsBetweenDates } from "@/lib/bookings/schemas";
import { getRepositories } from "@/lib/repositories";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

export async function POST(request: Request): Promise<Response> {
  const user = sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, bookingRequestSchema);
  if ("error" in body) return body.error;

  const { listingId, checkIn, checkOut, adults, children } = body.data;
  const repos = getRepositories();
  const listing = await repos.listings.findById(listingId);
  if (!listing) return jsonError(`Listing '${listingId}' was not found`, 404);
  if (adults + children > listing.maxGuests) {
    return jsonError(`This place allows at most ${listing.maxGuests} guests`, 400);
  }

  // Priced here from the listing, never from anything the client sent.
  const priceBreakdown = calculatePriceBreakdown(listing.pricePerNight, nightsBetweenDates(checkIn, checkOut));
  const booking = await repos.bookings.create(user.id, { listingId, checkIn, checkOut, guests: { adults, children }, priceBreakdown });
  if (booking === "unavailable") return jsonError("Those dates are no longer available", 409);
  return Response.json(ok(booking), { status: 201 });
}
