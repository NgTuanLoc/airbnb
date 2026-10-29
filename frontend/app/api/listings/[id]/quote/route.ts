import { ok } from "@/lib/api/envelope";
import { jsonError, withErrorEnvelope } from "@/lib/api/request";
import { bookingRequestSchema, nightsBetweenDates } from "@/lib/bookings/schemas";
import { getRepositories } from "@/lib/repositories";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

/**
 * Whether a stay is free and what it would cost, by the booking page's own rules (dates, guest cap, price math), so a
 * quote never disagrees with a booking. Public: the assistant's quote tool reads it.
 */
export const GET = withErrorEnvelope(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const parsed = bookingRequestSchema.safeParse({
    listingId: id,
    checkIn: query.get("checkIn") ?? "",
    checkOut: query.get("checkOut") ?? "",
    adults: query.get("guests") ?? "",
    children: 0,
  });
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid request", 400);

  const repos = getRepositories();
  const listing = await repos.listings.findById(id);
  if (!listing) return jsonError(`Listing '${id}' was not found`, 404);
  const { checkIn, checkOut, adults: guests } = parsed.data;
  if (guests > listing.maxGuests) return jsonError(`This place allows at most ${listing.maxGuests} guests`, 400);

  // Nights are half-open [checkIn, checkOut): a check-out day can be the next guest's check-in day.
  const stays = await repos.bookings.availability(id);
  const available = !stays.some((stay) => stay.checkIn < checkOut && checkIn < stay.checkOut);
  const nights = nightsBetweenDates(checkIn, checkOut);
  return Response.json(ok({ listingId: id, checkIn, checkOut, nights, available, priceBreakdown: calculatePriceBreakdown(listing.pricePerNight, nights) }));
});
