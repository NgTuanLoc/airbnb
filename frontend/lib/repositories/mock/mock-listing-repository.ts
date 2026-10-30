import type { Listing } from "@/lib/types";
import { listings } from "@/lib/data/listings";
import type { ListingFilters, ListingRepository } from "../listing-repository";
import { matchesFilters } from "@/lib/search/match-listing";

export const mockListingRepository: ListingRepository = {
  findAll(filters?: ListingFilters): Promise<Listing[]> {
    return Promise.resolve(listings.filter((listing) => matchesFilters(listing, filters)));
  },

  findById(id: string): Promise<Listing | null> {
    return Promise.resolve(listings.find((l) => l.id === id) ?? null);
  },
};
