import type { Listing } from "@/lib/types";
import { listings } from "@/lib/data/listings";
import type { ListingFilters, ListingRepository } from "../listing-repository";
import { matchesFilters } from "@/lib/search/match-listing";

export const mockListingRepository: ListingRepository = {
  async findAll(filters?: ListingFilters): Promise<Listing[]> {
    return listings.filter((listing) => matchesFilters(listing, filters));
  },

  async findById(id: string): Promise<Listing | null> {
    return listings.find((l) => l.id === id) ?? null;
  },
};
