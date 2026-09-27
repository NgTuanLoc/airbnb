// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { cities } from "@/lib/data/cities";
import { getRepositories } from "./index";
import { mockListingRepository } from "./mock/mock-listing-repository";
import { mockCityRepository } from "./mock/mock-city-repository";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getRepositories", () => {
  test("uses the mock repositories when DATA_SOURCE is unset or empty", () => {
    vi.stubEnv("DATA_SOURCE", undefined);
    expect(getRepositories().listings).toBe(mockListingRepository);

    vi.stubEnv("DATA_SOURCE", "");
    expect(getRepositories().cities).toBe(mockCityRepository);
  });

  test("uses the mock repositories when DATA_SOURCE=mock", () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    expect(getRepositories().listings).toBe(mockListingRepository);
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
});
