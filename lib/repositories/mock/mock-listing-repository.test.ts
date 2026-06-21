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
