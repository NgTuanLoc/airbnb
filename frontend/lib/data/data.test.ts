import { describe, expect, test } from "vitest";
import { listings } from "./listings";
import { cities } from "./cities";
import { hosts } from "./hosts";
import { reviews } from "./reviews";
import { experiences } from "./experiences";
import { services } from "./services";
import { listingSchema } from "@/lib/api-client/schemas";
import { CATEGORIES, EXPERIENCE_CATEGORIES, SERVICE_CATEGORIES } from "@/lib/types";

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
  test("every review references an existing listing or experience", () => {
    const ids = new Set([...listings.map((l) => l.id), ...experiences.map((e) => e.id)]);
    for (const r of reviews) {
      expect(ids.has(r.listingId)).toBe(true);
    }
  });

  test("listing l1 has at least two reviews", () => {
    expect(reviews.filter((r) => r.listingId === "l1").length).toBeGreaterThanOrEqual(2);
  });
});

describe("experiences data", () => {
  test("has at least 12 records with unique ids", () => {
    expect(experiences.length).toBeGreaterThanOrEqual(12);
    expect(new Set(experiences.map((e) => e.id)).size).toBe(experiences.length);
  });

  test("covers every non-All experience category", () => {
    for (const category of EXPERIENCE_CATEGORIES.filter((c) => c !== "All")) {
      expect(experiences.some((e) => e.category === category)).toBe(true);
    }
  });
});

describe("services data", () => {
  test("has at least 12 records with unique ids", () => {
    expect(services.length).toBeGreaterThanOrEqual(12);
    expect(new Set(services.map((s) => s.id)).size).toBe(services.length);
  });

  test("covers every non-All service category", () => {
    for (const category of SERVICE_CATEGORIES.filter((c) => c !== "All")) {
      expect(services.some((s) => s.serviceCategory === category)).toBe(true);
    }
  });
});
