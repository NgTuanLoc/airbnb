import { HOST_LISTING_ID_PREFIX } from "@/lib/host/options";
import { buildHostListing } from "@/lib/host/listing-input";
import type { Listing } from "@/lib/types";
import type { HostListingRepository } from "../host-listing-repository";

// In memory, by listing id; on globalThis so dev hot reload keeps it. A server restart clears it.
const store: Map<string, Listing> = ((globalThis as { __mockHostListings?: Map<string, Listing> }).__mockHostListings ??=
  new Map());

function owned(hostId: string, id: string): Listing | null {
  const listing = store.get(id);
  return listing && listing.hostId === hostId ? listing : null;
}

export const mockHostListingRepository: HostListingRepository = {
  async listForHost(hostId) {
    return [...store.values()].filter((l) => l.hostId === hostId).reverse();
  },

  async findById(id) {
    return store.get(id) ?? null;
  },

  async create(hostId, input) {
    const listing = buildHostListing(`${HOST_LISTING_ID_PREFIX}${crypto.randomUUID()}`, hostId, input, "listed");
    store.set(listing.id, listing);
    return listing;
  },

  async update(hostId, id, input) {
    const current = owned(hostId, id);
    if (!current) return null;
    const updated = buildHostListing(id, hostId, input, current.status ?? "listed");
    store.set(id, updated);
    return updated;
  },

  async setStatus(hostId, id, status) {
    const current = owned(hostId, id);
    if (!current) return null;
    const updated: Listing = { ...current, status };
    store.set(id, updated);
    return updated;
  },

  async listPublic() {
    return [...store.values()].filter((l) => l.status !== "unlisted");
  },
};
