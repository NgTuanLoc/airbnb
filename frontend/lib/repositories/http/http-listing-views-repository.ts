import { LISTING_ID_PATTERN, weeklyViewsSchema } from "@/lib/insights/views";
import type { ListingViewsRepository } from "../listing-views-repository";
import { apiFetch } from "./api-fetch";

/**
 * View counts from the backend's Insights module. They decorate pages, so a failure is logged and reads as no stats:
 * a stats outage never breaks a listing page or the host dashboard.
 */
export function createHttpListingViewsRepository(baseUrl: string): ListingViewsRepository {
  return {
    async weekly(listingId) {
      // Also keeps "." and ".." from resolving to another path.
      if (!LISTING_ID_PATTERN.test(listingId)) return null;
      try {
        return await apiFetch(baseUrl, `/api/listings/${listingId}/views`, weeklyViewsSchema);
      } catch (error) {
        console.error(`Reading the views of ${listingId} failed`, error);
        return null;
      }
    },
  };
}
