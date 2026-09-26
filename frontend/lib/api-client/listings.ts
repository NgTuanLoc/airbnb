import type { Listing } from "@/lib/types";
import type { ListingFilters } from "@/lib/repositories/listing-repository";
import { listingQueryString } from "@/lib/search/filters";
import { listingsEnvelopeSchema } from "./schemas";

export async function fetchListings(category?: string): Promise<Listing[]> {
  const query = category && category !== "All" ? `?category=${encodeURIComponent(category)}` : "";
  const res = await fetch(`/api/listings${query}`);
  const json: unknown = await res.json();
  const envelope = listingsEnvelopeSchema.parse(json);
  if (!envelope.success) {
    throw new Error(envelope.error ?? "Failed to load listings");
  }
  return envelope.data ?? [];
}

export async function fetchSearchListings(filters: ListingFilters): Promise<Listing[]> {
  const res = await fetch(`/api/listings${listingQueryString(filters)}`);
  const json: unknown = await res.json();
  const envelope = listingsEnvelopeSchema.parse(json);
  if (!envelope.success) {
    throw new Error(envelope.error ?? "Failed to load listings");
  }
  return envelope.data ?? [];
}
