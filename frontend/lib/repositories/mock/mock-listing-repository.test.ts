import { describe, expect, test } from "vitest";
import { mockListingRepository } from "./mock-listing-repository";

describe("mockListingRepository", () => {
  test("findAll with no filter returns all listings", async () => {
    const all = await mockListingRepository.findAll();
    expect(all.length).toBeGreaterThanOrEqual(16);
  });

  test("findAll filters by category", async () => {
    const cabins = await mockListingRepository.findAll({ category: "Cabins" });
    expect(cabins.length).toBeGreaterThan(0);
    expect(cabins.every((l) => l.category === "Cabins")).toBe(true);
  });

  test('findAll with category "All" returns everything', async () => {
    const all = await mockListingRepository.findAll({ category: "All" });
    const unfiltered = await mockListingRepository.findAll();
    expect(all.length).toBe(unfiltered.length);
  });

  test("findById returns the matching listing or null", async () => {
    const all = await mockListingRepository.findAll();
    const first = await mockListingRepository.findById(all[0].id);
    expect(first?.id).toBe(all[0].id);
    expect(await mockListingRepository.findById("does-not-exist")).toBeNull();
  });
});

describe("mockListingRepository.findAll filters", () => {
  test("filters by city (case-insensitive), skipping 'anywhere'", async () => {
    const aspen = await mockListingRepository.findAll({ location: "aspen" });
    expect(aspen.length).toBeGreaterThan(0);
    expect(aspen.every((l) => l.location.city === "Aspen")).toBe(true);
    const all = await mockListingRepository.findAll({ location: "anywhere" });
    expect(all.length).toBe((await mockListingRepository.findAll()).length);
  });

  test("filters by price range", async () => {
    const result = await mockListingRepository.findAll({ minPrice: 200, maxPrice: 300 });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((l) => l.pricePerNight >= 200 && l.pricePerNight <= 300)).toBe(true);
  });

  test("filters by minimum guests and bedrooms", async () => {
    const result = await mockListingRepository.findAll({ guests: 4, bedrooms: 2 });
    expect(result.every((l) => l.maxGuests >= 4 && l.bedrooms >= 2)).toBe(true);
  });

  test("combines filters (city + category)", async () => {
    const result = await mockListingRepository.findAll({ location: "Aspen", category: "Cabins" });
    expect(result.every((l) => l.location.city === "Aspen" && l.category === "Cabins")).toBe(true);
  });
});
