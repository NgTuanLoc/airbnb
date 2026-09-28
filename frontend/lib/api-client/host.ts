import type { HostListingInput } from "@/lib/host/schemas";
import type { Listing } from "@/lib/types";
import { callApi } from "./request";
import { listingSchema } from "./schemas";

export function createHostListing(input: HostListingInput): Promise<Listing> {
  return callApi("/api/host/listings", listingSchema, { method: "POST", body: JSON.stringify(input) });
}

export function updateHostListing(id: string, input: HostListingInput): Promise<Listing> {
  return callApi(`/api/host/listings/${encodeURIComponent(id)}`, listingSchema, { method: "PUT", body: JSON.stringify(input) });
}

export function setHostListingStatus(id: string, status: "listed" | "unlisted"): Promise<Listing> {
  return callApi(`/api/host/listings/${encodeURIComponent(id)}/status`, listingSchema, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
