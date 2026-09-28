import type { ListingFilters } from "@/lib/repositories/listing-repository";
import type { Listing } from "@/lib/types";

/**
 * Whether a listing passes the search filters. The one set of rules for seed and host listings:
 * city case-insensitive ("anywhere" = any), category ("All" = any), price range, and minimum guests/rooms/beds/baths.
 */
export function matchesFilters(listing: Listing, filters: ListingFilters = {}): boolean {
  const { location, category, minPrice, maxPrice, guests, bedrooms, beds, baths } = filters;
  if (location && location.toLowerCase() !== "anywhere" && listing.location.city.toLowerCase() !== location.toLowerCase()) {
    return false;
  }
  if (category && category !== "All" && listing.category !== category) return false;
  if (minPrice !== undefined && listing.pricePerNight < minPrice) return false;
  if (maxPrice !== undefined && listing.pricePerNight > maxPrice) return false;
  if (guests !== undefined && listing.maxGuests < guests) return false;
  if (bedrooms !== undefined && listing.bedrooms < bedrooms) return false;
  if (beds !== undefined && listing.beds < beds) return false;
  if (baths !== undefined && listing.baths < baths) return false;
  return true;
}
