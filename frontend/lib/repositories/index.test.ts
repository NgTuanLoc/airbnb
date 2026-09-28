// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { cities } from "@/lib/data/cities";
import { getRepositories } from "./index";
import { mockCityRepository } from "./mock/mock-city-repository";
import { mockListingRepository } from "./mock/mock-listing-repository";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getRepositories", () => {
  test("uses the mock repositories when DATA_SOURCE is unset or empty", async () => {
    vi.stubEnv("DATA_SOURCE", undefined);
    expect((await getRepositories().listings.findById("l1"))?.id).toBe("l1");

    vi.stubEnv("DATA_SOURCE", "");
    expect(getRepositories().cities).toBe(mockCityRepository);
  });

  test("uses the mock repositories when DATA_SOURCE=mock", () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    expect(getRepositories().cities).toBe(mockCityRepository);
  });

  test("uses the API at API_HTTP when DATA_SOURCE=api", async () => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://backend.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: cities }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const repos = getRepositories();

    expect(repos.listings).not.toBe(mockListingRepository);
    expect(await repos.cities.findAll()).toEqual(cities);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://backend.test/api/cities");
  });

  test("throws when DATA_SOURCE=api has no API_HTTP", () => {
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", undefined);

    expect(() => getRepositories()).toThrow("DATA_SOURCE=api needs API_HTTP");
  });

  test("throws on any other DATA_SOURCE value instead of falling back", () => {
    vi.stubEnv("DATA_SOURCE", "API");

    expect(() => getRepositories()).toThrow('DATA_SOURCE must be "mock" or "api", got "API"');
  });

  test("wishlists and bookings are the frontend mocks in both modes", () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    const mock = getRepositories();
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://backend.test");
    const api = getRepositories();

    expect(api.wishlists).toBe(mock.wishlists);
    expect(api.bookings).toBe(mock.bookings);
  });

  test("host listings and profiles are the frontend mocks in both modes, and join the catalog", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    const mock = getRepositories();
    vi.stubEnv("DATA_SOURCE", "api");
    vi.stubEnv("API_HTTP", "http://backend.test");
    const api = getRepositories();

    expect(api.hostListings).toBe(mock.hostListings);
    expect(api.hostProfiles).toBe(mock.hostProfiles);
    const created = await mock.hostListings.create(`u-${crypto.randomUUID()}@example.com`, (await import("@/lib/host/schemas")).hostListingInputSchema.parse((await import("@/lib/host/test-fixtures")).validInput));
    expect((await mock.listings.findById(created.id))?.id).toBe(created.id);
  });
});
