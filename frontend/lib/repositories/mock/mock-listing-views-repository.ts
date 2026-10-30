import type { ListingViewsRepository } from "../listing-views-repository";

/** Mock mode has no Kafka and counts nothing, so pages show no view stats. */
export const mockListingViewsRepository: ListingViewsRepository = {
  weekly: () => Promise.resolve(null),
};
