import { createHttpRepositories, type Repositories } from "./http/http-repositories";
import type { BookingRepository } from "./booking-repository";
import type { WishlistRepository } from "./wishlist-repository";
import { mockBookingRepository } from "./mock/mock-booking-repository";
import { mockCityRepository } from "./mock/mock-city-repository";
import { mockExperienceRepository } from "./mock/mock-experience-repository";
import { mockHostRepository } from "./mock/mock-host-repository";
import { mockListingRepository } from "./mock/mock-listing-repository";
import { mockReviewRepository } from "./mock/mock-review-repository";
import { mockServiceRepository } from "./mock/mock-service-repository";
import { mockWishlistRepository } from "./mock/mock-wishlist-repository";

export type { Repositories };

export interface AppRepositories extends Repositories {
  wishlists: WishlistRepository;
  bookings: BookingRepository;
}

// Wishlists and bookings are frontend mocks in both data modes: the backend doesn't serve them yet.
const accountRepositories = { wishlists: mockWishlistRepository, bookings: mockBookingRepository };

const mockRepositories: AppRepositories = {
  listings: mockListingRepository,
  experiences: mockExperienceRepository,
  services: mockServiceRepository,
  hosts: mockHostRepository,
  reviews: mockReviewRepository,
  cities: mockCityRepository,
  ...accountRepositories,
};

/**
 * The one switch between mock data and the backend, driven by the server-only
 * DATA_SOURCE flag (mock by default). Reads the env on every call.
 */
export function getRepositories(): AppRepositories {
  const source = process.env.DATA_SOURCE || "mock";
  if (source === "mock") return mockRepositories;
  if (source !== "api") throw new Error(`DATA_SOURCE must be "mock" or "api", got "${source}"`);

  const baseUrl = process.env.API_HTTP;
  if (!baseUrl) throw new Error("DATA_SOURCE=api needs API_HTTP, the backend base URL (Aspire sets it)");
  return { ...createHttpRepositories(baseUrl), ...accountRepositories };
}
