import { ok } from "@/lib/api/envelope";
import { jsonError, parseBody, unauthorized, withErrorEnvelope } from "@/lib/api/request";
import { sessionFromRequest } from "@/lib/auth/session";
import { bookingRequestSchema, nightsBetweenDates } from "@/lib/bookings/schemas";
import { HOST_LISTING_ID_PREFIX } from "@/lib/host/options";
import { getRepositories } from "@/lib/repositories";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

export const POST = withErrorEnvelope(async (request: Request) => {
  const user = await sessionFromRequest(request);
  if (!user) return unauthorized();
  const body = await parseBody(request, bookingRequestSchema);
  if ("error" in body) return body.error;

  const { listingId, checkIn, checkOut, adults, children } = body.data;
  const repos = getRepositories();
  const listing = await repos.listings.findById(listingId);
  if (!listing) return jsonError(`Listing '${listingId}' was not found`, 404);
  if (listing.hostId === user.id) return jsonError("You can't book your own listing", 400);
  if (listing.status === "unlisted") return jsonError("This place isn't taking bookings right now", 400);
  if (adults + children > listing.maxGuests) {
    return jsonError(`This place allows at most ${listing.maxGuests} guests`, 400);
  }

  // Priced here from the listing, never from anything the client sent.
  const priceBreakdown = calculatePriceBreakdown(listing.pricePerNight, nightsBetweenDates(checkIn, checkOut));
  const quote = listing.id.startsWith(HOST_LISTING_ID_PREFIX)
    ? { hostId: listing.hostId, pricePerNight: listing.pricePerNight, maxGuests: listing.maxGuests }
    : undefined;
  const booking = await repos.bookings.create(
    { id: user.id, name: user.name, email: user.email },
    { listingId, hostId: listing.hostId, checkIn, checkOut, guests: { adults, children }, priceBreakdown },
    quote,
  );
  if (booking === "unavailable") return jsonError("Those dates were just booked. Pick different dates.", 409);
  return Response.json(ok(booking), { status: 201 });
});
