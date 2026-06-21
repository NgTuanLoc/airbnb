import { describe, expect, test } from "vitest";
import { listings } from "./listings";
import { cities } from "./cities";
import { hosts } from "./hosts";
import { reviews } from "./reviews";
import { listingSchema } from "@/lib/api-client/schemas";
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

  test("every listing satisfies the listing schema", () => {
    for (const l of listings) {
      expect(() => listingSchema.parse(l)).not.toThrow();
    }
  });

  test("every listing has 5 photos, amenities, and a known category", () => {
    for (const l of listings) {
      expect(l.photos.length).toBe(5);
      expect(l.amenities.length).toBeGreaterThan(0);
      expect(allowedCategories).toContain(l.category);
    }
  });

  test("every listing references an existing host", () => {
    const hostIds = new Set(hosts.map((h) => h.id));
    for (const l of listings) {
      expect(hostIds.has(l.hostId)).toBe(true);
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

describe("seed reviews", () => {
  test("every review references an existing listing", () => {
    const listingIds = new Set(listings.map((l) => l.id));
    for (const r of reviews) {
      expect(listingIds.has(r.listingId)).toBe(true);
    }
  });

  test("listing l1 has at least two reviews", () => {
    expect(reviews.filter((r) => r.listingId === "l1").length).toBeGreaterThanOrEqual(2);
  });
});
