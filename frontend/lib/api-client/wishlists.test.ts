import { afterEach, expect, test, vi } from "vitest";
import { addToWishlist, createWishlist, fetchWishlists, removeFromWishlists } from "./wishlists";

const wishlist = { id: "w1", name: "Summer trip", listingIds: ["l1"], createdAt: "2026-01-01T00:00:00.000Z" };

function mockFetch(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body } as Response);
}

afterEach(() => vi.unstubAllGlobals());

test("fetchWishlists returns the saved wishlists", async () => {
  vi.stubGlobal("fetch", mockFetch({ success: true, data: [wishlist] }));
  await expect(fetchWishlists()).resolves.toEqual([wishlist]);
});

test("createWishlist posts a name and optional listing", async () => {
  const f = mockFetch({ success: true, data: wishlist });
  vi.stubGlobal("fetch", f);
  await expect(createWishlist({ name: "Summer trip", listingId: "l1" })).resolves.toEqual(wishlist);
  expect(f).toHaveBeenCalledWith("/api/wishlists", expect.objectContaining({ method: "POST" }));
});

test("addToWishlist posts the listing id to the wishlist's listings route", async () => {
  const f = mockFetch({ success: true, data: wishlist });
  vi.stubGlobal("fetch", f);
  await expect(addToWishlist("w1", "l1")).resolves.toEqual(wishlist);
  expect(f).toHaveBeenCalledWith("/api/wishlists/w1/listings", expect.objectContaining({ method: "POST" }));
});

test("removeFromWishlists deletes the listing from every wishlist", async () => {
  const f = mockFetch({ success: true, data: null });
  vi.stubGlobal("fetch", f);
  await expect(removeFromWishlists("l1")).resolves.toBeUndefined();
  expect(f).toHaveBeenCalledWith("/api/wishlists/saved/l1", expect.objectContaining({ method: "DELETE" }));
});
