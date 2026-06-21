import type { Review } from "@/lib/types";
import { reviews } from "@/lib/data/reviews";
import type { ReviewRepository } from "../review-repository";

export const mockReviewRepository: ReviewRepository = {
  async findByListingId(listingId: string): Promise<Review[]> {
    return reviews.filter((r) => r.listingId === listingId);
  },
};
