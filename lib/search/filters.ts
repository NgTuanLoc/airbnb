import type { ListingFilters } from "@/lib/repositories/listing-repository";

function num(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function filtersFromSearch(location: string, params: URLSearchParams): ListingFilters {
  return {
    location,
    category: params.get("category") ?? undefined,
    minPrice: num(params.get("minPrice")),
    maxPrice: num(params.get("maxPrice")),
    guests: num(params.get("guests")),
    bedrooms: num(params.get("bedrooms")),
    beds: num(params.get("beds")),
    baths: num(params.get("baths")),
  };
}

export function listingQueryString(filters: ListingFilters): string {
  const params = new URLSearchParams();
  const { location, category, minPrice, maxPrice, guests, bedrooms, beds, baths } = filters;

  if (location && location.toLowerCase() !== "anywhere") params.set("location", location);
  if (category && category !== "All") params.set("category", category);
  if (minPrice !== undefined) params.set("minPrice", String(minPrice));
  if (maxPrice !== undefined) params.set("maxPrice", String(maxPrice));
  if (guests !== undefined) params.set("guests", String(guests));
  if (bedrooms !== undefined) params.set("bedrooms", String(bedrooms));
  if (beds !== undefined) params.set("beds", String(beds));
  if (baths !== undefined) params.set("baths", String(baths));

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function countActiveFilters(filters: ListingFilters): number {
  const { minPrice, maxPrice, guests, bedrooms, beds, baths } = filters;
  return [minPrice, maxPrice, guests, bedrooms, beds, baths].filter((v) => v !== undefined).length;
}
