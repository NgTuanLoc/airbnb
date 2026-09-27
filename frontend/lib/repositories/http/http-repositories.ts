import { z } from "zod";
import type { Review } from "@/lib/types";
import {
  citySchema,
  experienceSchema,
  hostSchema,
  listingSchema,
  reviewDtoSchema,
  serviceSchema,
  type ReviewDto,
} from "@/lib/api-client/schemas";
import { listingQueryString } from "@/lib/search/filters";
import type { CityRepository } from "../city-repository";
import type { ExperienceRepository } from "../experience-repository";
import type { HostRepository } from "../host-repository";
import type { ListingRepository } from "../listing-repository";
import type { ReviewRepository } from "../review-repository";
import type { ServiceRepository } from "../service-repository";
import { apiFetch } from "./api-fetch";

export interface Repositories {
  listings: ListingRepository;
  experiences: ExperienceRepository;
  services: ServiceRepository;
  hosts: HostRepository;
  reviews: ReviewRepository;
  cities: CityRepository;
}

// UTC so the server's timezone can never shift a review into another month.
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export function toReview(dto: ReviewDto): Review {
  return {
    id: dto.id,
    listingId: dto.subjectId,
    authorName: dto.authorName,
    authorAvatar: dto.authorAvatar,
    date: MONTH_YEAR.format(new Date(dto.createdAt)),
    rating: dto.rating,
    body: dto.body,
  };
}

function categoryQuery(category?: string): string {
  return category && category !== "All" ? `?category=${encodeURIComponent(category)}` : "";
}

export function createHttpRepositories(baseUrl: string): Repositories {
  async function list<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>[]> {
    const data = await apiFetch(baseUrl, path, z.array(schema));
    if (data === null) throw new Error(`GET ${path} returned 404`);
    return data;
  }

  const byId =
    <T extends z.ZodType>(resource: string, schema: T) =>
    (id: string) =>
      // "." and ".." survive encodeURIComponent, then URL() resolves them as dot segments
      // (escaping out of the /api/<resource>/ path), so short-circuit them to a 404-equivalent null.
      id === "." || id === ".."
        ? Promise.resolve(null)
        : apiFetch(baseUrl, `/api/${resource}/${encodeURIComponent(id)}`, schema);

  return {
    listings: {
      findAll: (filters = {}) => list(`/api/listings${listingQueryString(filters)}`, listingSchema),
      findById: byId("listings", listingSchema),
    },
    experiences: {
      findAll: (filters) => list(`/api/experiences${categoryQuery(filters?.category)}`, experienceSchema),
      findById: byId("experiences", experienceSchema),
    },
    services: {
      findAll: (filters) => list(`/api/services${categoryQuery(filters?.category)}`, serviceSchema),
      findById: byId("services", serviceSchema),
    },
    hosts: { findById: byId("hosts", hostSchema) },
    reviews: {
      findByListingId: async (listingId) =>
        (await list(`/api/reviews?subjectId=${encodeURIComponent(listingId)}`, reviewDtoSchema)).map(toReview),
    },
    cities: { findAll: () => list("/api/cities", citySchema) },
  };
}
