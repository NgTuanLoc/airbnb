import type { Review } from "@/lib/types";

export interface ReviewRepository {
  findByListingId(listingId: string): Promise<Review[]>;
}
