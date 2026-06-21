import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchListings } from "./listings";
import type { Listing } from "@/lib/types";

const sample: Listing = {
  id: "l1",
  title: "Cabin",
  location: { city: "Aspen", country: "USA", lat: 39, lng: -106 },
  photos: ["https://example.com/p.jpg"],
  pricePerNight: 220,
  rating: 4.9,
  reviewCount: 10,
  isGuestFavorite: true,
  hostId: "h1",
  category: "Cabins",
};

function mockFetch(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  } as Response);
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchListings", () => {
  test("returns validated listings on a successful envelope", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true, data: [sample], meta: { total: 1, page: 1, limit: 1 } }));
    const result = await fetchListings();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("l1");
  });

  test("passes the category as a query param", async () => {
    const f = mockFetch({ success: true, data: [], meta: { total: 0, page: 1, limit: 0 } });
    vi.stubGlobal("fetch", f);
    await fetchListings("Beachfront");
    expect(f).toHaveBeenCalledWith(expect.stringContaining("category=Beachfront"));
  });

  test("throws when the envelope reports failure", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: false, error: "boom" }));
    await expect(fetchListings()).rejects.toThrow("boom");
  });

  test("throws when a listing fails schema validation", async () => {
    vi.stubGlobal("fetch", mockFetch({ success: true, data: [{ id: "x" }] }));
    await expect(fetchListings()).rejects.toThrow();
  });
});
