import { describe, expect, test } from "vitest";
import { listings } from "@/lib/data/listings";
import type { Listing } from "@/lib/types";
import { matchesFilters } from "./match-listing";

const cabin: Listing = { ...listings[0], location: { ...listings[0].location, city: "Aspen" }, category: "Cabins", pricePerNight: 200, maxGuests: 2, bedrooms: 1, beds: 1, baths: 1 };

describe("matchesFilters", () => {
  test("no filters (or 'anywhere' and 'All') match everything", () => {
    expect(matchesFilters(cabin)).toBe(true);
    expect(matchesFilters(cabin, { location: "anywhere", category: "All" })).toBe(true);
  });

  test("city is matched case-insensitively", () => {
    expect(matchesFilters(cabin, { location: "aSPEN" })).toBe(true);
    expect(matchesFilters(cabin, { location: "Malibu" })).toBe(false);
  });

  test("category, price range and minimums", () => {
    expect(matchesFilters(cabin, { category: "Beachfront" })).toBe(false);
    expect(matchesFilters(cabin, { minPrice: 200, maxPrice: 200 })).toBe(true);
    expect(matchesFilters(cabin, { minPrice: 201 })).toBe(false);
    expect(matchesFilters(cabin, { maxPrice: 199 })).toBe(false);
    expect(matchesFilters(cabin, { guests: 2, bedrooms: 1, beds: 1, baths: 1 })).toBe(true);
    expect(matchesFilters(cabin, { guests: 4 })).toBe(false);
    expect(matchesFilters(cabin, { bedrooms: 2 })).toBe(false);
    expect(matchesFilters(cabin, { beds: 2 })).toBe(false);
    expect(matchesFilters(cabin, { baths: 1.5 })).toBe(false);
  });
});
