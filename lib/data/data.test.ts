import { describe, expect, test } from "vitest";
import { listings } from "./listings";
import { cities } from "./cities";
import { CATEGORIES } from "@/lib/types";

const allowedCategories = CATEGORIES.filter((c) => c !== "All");

describe("seed listings", () => {
  test("has at least 16 listings", () => {
    expect(listings.length).toBeGreaterThanOrEqual(16);
  });

  test("every listing has a unique id", () => {
    const ids = new Set(listings.map((l) => l.id));
    expect(ids.size).toBe(listings.length);
  });

  test("every listing has a photo, positive price, and a known category", () => {
    for (const l of listings) {
      expect(l.photos.length).toBeGreaterThan(0);
      expect(l.pricePerNight).toBeGreaterThan(0);
      expect(allowedCategories).toContain(l.category);
    }
  });

  test("every category (except All) has at least one listing", () => {
    for (const c of allowedCategories) {
      expect(listings.some((l) => l.category === c)).toBe(true);
    }
  });
});

describe("seed cities", () => {
  test("has at least 6 cities with unique ids", () => {
    expect(cities.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(cities.map((c) => c.id));
    expect(ids.size).toBe(cities.length);
  });
});
