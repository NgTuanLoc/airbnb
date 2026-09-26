import type { Listing } from "@/lib/types";
import { listings } from "@/lib/data/listings";
import type { ListingFilters, ListingRepository } from "../listing-repository";

export const mockListingRepository: ListingRepository = {
  async findAll(filters?: ListingFilters): Promise<Listing[]> {
    const f = filters ?? {};
    let result = listings;

    const { location, category, minPrice, maxPrice, guests, bedrooms, beds, baths } = f;

    if (location && location.toLowerCase() !== "anywhere") {
      const city = location.toLowerCase();
      result = result.filter((l) => l.location.city.toLowerCase() === city);
    }
    if (category && category !== "All") {
      result = result.filter((l) => l.category === category);
    }
    if (minPrice !== undefined) result = result.filter((l) => l.pricePerNight >= minPrice);
    if (maxPrice !== undefined) result = result.filter((l) => l.pricePerNight <= maxPrice);
    if (guests !== undefined) result = result.filter((l) => l.maxGuests >= guests);
    if (bedrooms !== undefined) result = result.filter((l) => l.bedrooms >= bedrooms);
    if (beds !== undefined) result = result.filter((l) => l.beds >= beds);
    if (baths !== undefined) result = result.filter((l) => l.baths >= baths);

    return result;
  },

  async findById(id: string): Promise<Listing | null> {
    return listings.find((l) => l.id === id) ?? null;
  },
};
