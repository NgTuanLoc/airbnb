import type { Listing } from "@/lib/types";
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
