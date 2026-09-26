import { describe, expect, test } from "vitest";
import { filtersFromSearch, listingQueryString, countActiveFilters } from "./filters";

describe("filtersFromSearch", () => {
  test("reads the location and numeric params", () => {
    const params = new URLSearchParams("category=Cabins&minPrice=100&maxPrice=300&guests=4");
    const filters = filtersFromSearch("Aspen", params);
    expect(filters).toMatchObject({ location: "Aspen", category: "Cabins", minPrice: 100, maxPrice: 300, guests: 4 });
    expect(filters.bedrooms).toBeUndefined();
  });

  test("ignores non-numeric values", () => {
    const filters = filtersFromSearch("Aspen", new URLSearchParams("minPrice=abc"));
    expect(filters.minPrice).toBeUndefined();
  });
});

describe("listingQueryString", () => {
  test("builds a query string, omitting location 'anywhere' and category 'All'", () => {
    expect(listingQueryString({ location: "anywhere", category: "All", minPrice: 150 })).toBe("?minPrice=150");
  });

  test("includes location and category when meaningful", () => {
    const qs = listingQueryString({ location: "Aspen", category: "Cabins" });
    expect(qs).toContain("location=Aspen");
    expect(qs).toContain("category=Cabins");
  });

  test("returns an empty string when there are no filters", () => {
    expect(listingQueryString({})).toBe("");
  });
});

describe("countActiveFilters", () => {
  test("counts modal filters but not location or category", () => {
    expect(countActiveFilters({ location: "Aspen", category: "Cabins", minPrice: 100, guests: 2 })).toBe(2);
    expect(countActiveFilters({ location: "Aspen", category: "Cabins" })).toBe(0);
  });
});
