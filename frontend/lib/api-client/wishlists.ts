import { z } from "zod";
import type { Wishlist } from "@/lib/types";
import { callApi } from "./request";
import { wishlistSchema } from "./schemas";

export const WISHLISTS_QUERY_KEY = ["wishlists"] as const;

export function fetchWishlists(): Promise<Wishlist[]> {
  return callApi("/api/wishlists", z.array(wishlistSchema));
}

export function createWishlist(input: { name: string; listingId?: string }): Promise<Wishlist> {
  return callApi("/api/wishlists", wishlistSchema, { method: "POST", body: JSON.stringify(input) });
}

export function addToWishlist(wishlistId: string, listingId: string): Promise<Wishlist> {
  return callApi(`/api/wishlists/${encodeURIComponent(wishlistId)}/listings`, wishlistSchema, {
    method: "POST",
    body: JSON.stringify({ listingId }),
  });
}

export async function removeFromWishlists(listingId: string): Promise<void> {
  await callApi(`/api/wishlists/saved/${encodeURIComponent(listingId)}`, z.null(), { method: "DELETE" });
}
