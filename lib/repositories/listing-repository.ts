import type { Listing } from "@/lib/types";

export interface ListingFilters {
  category?: string;
}

export interface ListingRepository {
  findAll(filters?: ListingFilters): Promise<Listing[]>;
  findById(id: string): Promise<Listing | null>;
}
