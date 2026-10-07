import "server-only";
import { dataSource } from "../data-source";
import { createHttpRepositories, type Repositories } from "./http/http-repositories";
import type { BookingRepository } from "./booking-repository";
import { combineHosts, combineListings } from "./combined";
import type { HostListingRepository } from "./host-listing-repository";
import type { HostProfileRepository } from "./host-profile-repository";
import type { WishlistRepository } from "./wishlist-repository";
import { mockBookingRepository } from "./mock/mock-booking-repository";
import { mockCityRepository } from "./mock/mock-city-repository";
import { mockExperienceRepository } from "./mock/mock-experience-repository";
import { mockHostListingRepository } from "./mock/mock-host-listing-repository";
import { mockHostProfileRepository } from "./mock/mock-host-profile-repository";
import { mockHostRepository } from "./mock/mock-host-repository";
import { mockListingRepository } from "./mock/mock-listing-repository";
import { mockReviewRepository } from "./mock/mock-review-repository";
import { mockServiceRepository } from "./mock/mock-service-repository";
import { mockWishlistRepository } from "./mock/mock-wishlist-repository";

export type { Repositories };

export interface AppRepositories extends Repositories {
  wishlists: WishlistRepository;
  bookings: BookingRepository;
  hostListings: HostListingRepository;
  hostProfiles: HostProfileRepository;
}

// Wishlists, bookings and host data are frontend mocks in both data modes: the backend doesn't serve them yet.
const accountRepositories = {
  wishlists: mockWishlistRepository,
  bookings: mockBookingRepository,
  hostListings: mockHostListingRepository,
  hostProfiles: mockHostProfileRepository,
};

/** The catalog plus host-created listings and host profiles, so guests see and book host listings anywhere. */
function withHostData(catalog: Repositories): AppRepositories {
  return {
    ...catalog,
    listings: combineListings(catalog.listings, mockHostListingRepository),
    hosts: combineHosts(catalog.hosts, mockHostProfileRepository),
    ...accountRepositories,
  };
}

const mockRepositories: AppRepositories = withHostData({
  listings: mockListingRepository,
  experiences: mockExperienceRepository,
  services: mockServiceRepository,
  hosts: mockHostRepository,
  reviews: mockReviewRepository,
  cities: mockCityRepository,
});

/**
 * The one switch between mock data and the backend, driven by `dataSource()`
 * (the server-only DATA_SOURCE flag, mock by default). Reads the env on every call.
 */
export function getRepositories(): AppRepositories {
  const source = dataSource();
  return source.kind === "mock" ? mockRepositories : withHostData(createHttpRepositories(source.baseUrl));
}
