import { HOST_LISTING_ID_PREFIX } from "@/lib/host/options";
import { matchesFilters } from "@/lib/search/match-listing";
import type { HostListingRepository } from "./host-listing-repository";
import type { HostProfileRepository } from "./host-profile-repository";
import type { HostRepository } from "./host-repository";
import type { ListingRepository } from "./listing-repository";

/** The public catalog: seed/backend listings, then listed host listings that pass the same filters. */
export function combineListings(catalog: ListingRepository, hostListings: HostListingRepository): ListingRepository {
  return {
    async findAll(filters) {
      const [fromCatalog, fromHosts] = await Promise.all([catalog.findAll(filters), hostListings.listPublic()]);
      return [...fromCatalog, ...fromHosts.filter((listing) => matchesFilters(listing, filters))];
    },
    findById: (id) => (id.startsWith(HOST_LISTING_ID_PREFIX) ? hostListings.findById(id) : catalog.findById(id)),
  };
}

/** Hosts: a host profile (account ids are opaque) wins; everyone else comes from the catalog. */
export function combineHosts(catalog: HostRepository, profiles: HostProfileRepository): HostRepository {
  return { findById: async (id) => (await profiles.findById(id)) ?? catalog.findById(id) };
}
