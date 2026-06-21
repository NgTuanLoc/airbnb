import type { Listing } from "@/lib/types";

export interface ListingFilters {
  location?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  guests?: number;
  bedrooms?: number;
  beds?: number;
  baths?: number;
}

export interface ListingRepository {
  findAll(filters?: ListingFilters): Promise<Listing[]>;
  findById(id: string): Promise<Listing | null>;
}
