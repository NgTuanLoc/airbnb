import type { Review } from "@/lib/types";
import { reviews } from "@/lib/data/reviews";
import type { ReviewRepository } from "../review-repository";

export const mockReviewRepository: ReviewRepository = {
  findByListingId(listingId: string): Promise<Review[]> {
    return Promise.resolve(reviews.filter((r) => r.listingId === listingId));
  },
};
