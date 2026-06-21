import type { Listing } from "@/lib/types";
import { listings } from "@/lib/data/listings";
import type { ListingFilters, ListingRepository } from "../listing-repository";

export const mockListingRepository: ListingRepository = {
  async findAll(filters?: ListingFilters): Promise<Listing[]> {
    const category = filters?.category;
    if (!category || category === "All") return listings;
    return listings.filter((l) => l.category === category);
  },

  async findById(id: string): Promise<Listing | null> {
    return listings.find((l) => l.id === id) ?? null;
  },
};
