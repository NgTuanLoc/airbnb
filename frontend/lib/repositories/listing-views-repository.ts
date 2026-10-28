import type { WeeklyViews } from "@/lib/insights/views";

/** How often a listing was viewed lately; null when there are no stats (mock mode, or the backend can't say). */
export interface ListingViewsRepository {
  weekly(listingId: string): Promise<WeeklyViews | null>;
}
