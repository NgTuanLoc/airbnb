import type { HostListingInput } from "@/lib/host/schemas";
import type { Listing } from "@/lib/types";

export interface HostListingRepository {
  /** The host's own listings, any status, newest first. */
  listForHost(hostId: string): Promise<Listing[]>;
  /** Any status: unlisted listings still resolve for bookings and the host's views. */
  findById(id: string): Promise<Listing | null>;
  create(hostId: string, input: HostListingInput): Promise<Listing>;
  /** Null when the listing doesn't exist or isn't the host's. Keeps the current status. */
  update(hostId: string, id: string, input: HostListingInput): Promise<Listing | null>;
  setStatus(hostId: string, id: string, status: "listed" | "unlisted"): Promise<Listing | null>;
  /** Every listed host listing, for the public catalog. */
  listPublic(): Promise<Listing[]>;
}
