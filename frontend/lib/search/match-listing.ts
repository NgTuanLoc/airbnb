import type { ListingFilters } from "@/lib/repositories/listing-repository";
import type { Listing } from "@/lib/types";

const atLeast = (value: number, min: number | undefined) => min === undefined || value >= min;
const atMost = (value: number, max: number | undefined) => max === undefined || value <= max;

/**
 * Whether a listing passes the search filters. The one set of rules for seed and host listings:
 * city case-insensitive ("anywhere" = any), category ("All" = any), price range, and minimum guests/rooms/beds/baths.
 */
export function matchesFilters(listing: Listing, filters: ListingFilters = {}): boolean {
  const { location, category, minPrice, maxPrice, guests, bedrooms, beds, baths } = filters;
  const inCity = !location || location.toLowerCase() === "anywhere" || listing.location.city.toLowerCase() === location.toLowerCase();
  const inCategory = !category || category === "All" || listing.category === category;
  return (
    inCity &&
    inCategory &&
    atLeast(listing.pricePerNight, minPrice) &&
    atMost(listing.pricePerNight, maxPrice) &&
    atLeast(listing.maxGuests, guests) &&
    atLeast(listing.bedrooms, bedrooms) &&
    atLeast(listing.beds, beds) &&
    atLeast(listing.baths, baths)
  );
}
