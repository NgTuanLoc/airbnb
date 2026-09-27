// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { listings } from "@/lib/data/listings";
import { hosts } from "@/lib/data/hosts";
import { cities } from "@/lib/data/cities";
import type { ReviewDto } from "@/lib/api-client/schemas";
import { createHttpRepositories, toReview } from "./http-repositories";

const BASE = "http://backend.test";

/** Serves each "pathname+search" key; anything else is the backend's 404 envelope. */
function stubBackend(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    const data = routes[url.pathname + url.search];
    return data === undefined
      ? new Response(JSON.stringify({ success: false, error: "not found" }), { status: 404 })
      : new Response(JSON.stringify({ success: true, data }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestedPaths(fetchMock: ReturnType<typeof stubBackend>): string[] {
  return fetchMock.mock.calls.map(([input]) => {
    const url = new URL(String(input));
    return url.pathname + url.search;
  });
}

const dto: ReviewDto = {
  id: "l1-r1",
  subjectType: "stay",
  subjectId: "l1",
  authorName: "Sarah",
  authorAvatar: "https://example.com/a.jpg",
  rating: 5,
  body: "Lovely",
  createdAt: "2026-03-01T00:00:00+00:00",
};

afterEach(() => vi.unstubAllGlobals());

describe("createHttpRepositories", () => {
  const repos = createHttpRepositories(BASE);

  test("listings.findAll sends the filters with the mock's 'anywhere'/'All' semantics", async () => {
    const fetchMock = stubBackend({ "/api/listings?category=Cabins&guests=2": [listings[0]] });

    const result = await repos.listings.findAll({ location: "anywhere", category: "Cabins", guests: 2 });

    expect(result).toEqual([listings[0]]);
    expect(requestedPaths(fetchMock)).toEqual(["/api/listings?category=Cabins&guests=2"]);
  });

  test("experiences and services skip the 'All' category and encode real ones", async () => {
    const fetchMock = stubBackend({ "/api/experiences": [], "/api/services?category=Hair%20%26%20makeup": [] });

    await repos.experiences.findAll({ category: "All" });
    await repos.services.findAll({ category: "Hair & makeup" });

    expect(requestedPaths(fetchMock)).toEqual(["/api/experiences", "/api/services?category=Hair%20%26%20makeup"]);
  });

  test("findById returns the item, or null on 404", async () => {
    stubBackend({ "/api/listings/l1": listings[0], "/api/hosts/h1": hosts[0] });

    expect(await repos.listings.findById("l1")).toEqual(listings[0]);
    expect(await repos.hosts.findById("h1")).toEqual(hosts[0]);
    expect(await repos.listings.findById("l999")).toBeNull();
    expect(await repos.experiences.findById("e999")).toBeNull();
    expect(await repos.services.findById("s999")).toBeNull();
  });

  test("encodes ids into a single path segment", async () => {
    const fetchMock = stubBackend({});

    await repos.listings.findById("a/b?c#d");

    expect(requestedPaths(fetchMock)).toEqual(["/api/listings/a%2Fb%3Fc%23d"]);
  });

  test("cities.findAll returns the cities", async () => {
    stubBackend({ "/api/cities": cities });

    expect(await repos.cities.findAll()).toEqual(cities);
  });

  test("reviews.findByListingId queries by subject and maps to the frontend Review", async () => {
    const fetchMock = stubBackend({ "/api/reviews?subjectId=l1": [dto] });

    const result = await repos.reviews.findByListingId("l1");

    expect(requestedPaths(fetchMock)).toEqual(["/api/reviews?subjectId=l1"]);
    expect(result).toEqual([
      { id: "l1-r1", listingId: "l1", authorName: "Sarah", authorAvatar: "https://example.com/a.jpg", date: "March 2026", rating: 5, body: "Lovely" },
    ]);
  });

  test("a list endpoint answering 404 throws instead of returning nothing", async () => {
    stubBackend({});

    await expect(repos.cities.findAll()).rejects.toThrow("GET /api/cities returned 404");
  });
});

describe("toReview", () => {
  test("formats createdAt as the UTC month", () => {
    expect(toReview(dto).date).toBe("March 2026");
    expect(toReview({ ...dto, createdAt: "2026-03-01T00:30:00+02:00" }).date).toBe("February 2026");
    expect(toReview({ ...dto, createdAt: "2025-12-31T23:59:59Z" }).date).toBe("December 2025");
  });
});
