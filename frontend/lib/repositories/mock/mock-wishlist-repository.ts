import type { Wishlist } from "@/lib/types";
import type { WishlistRepository } from "../wishlist-repository";

// In memory, per user; on globalThis so dev hot reload keeps it. A server restart clears it.
const store: Map<string, Wishlist[]> = ((globalThis as { __mockWishlists?: Map<string, Wishlist[]> }).__mockWishlists ??=
  new Map());

const listsOf = (userId: string): Wishlist[] => store.get(userId) ?? [];

export const mockWishlistRepository: WishlistRepository = {
  listForUser(userId) {
    return Promise.resolve(listsOf(userId));
  },

  findById(userId, id) {
    return Promise.resolve(listsOf(userId).find((w) => w.id === id) ?? null);
  },

  create(userId, name) {
    const wishlist: Wishlist = { id: crypto.randomUUID(), name, listingIds: [], createdAt: new Date().toISOString() };
    store.set(userId, [wishlist, ...listsOf(userId)]);
    return Promise.resolve(wishlist);
  },

  addListing(userId, wishlistId, listingId) {
    const current = listsOf(userId).find((w) => w.id === wishlistId);
    if (!current) return Promise.resolve(null);
    if (current.listingIds.includes(listingId)) return Promise.resolve(current);
    const updated: Wishlist = { ...current, listingIds: [...current.listingIds, listingId] };
    store.set(userId, listsOf(userId).map((w) => (w.id === wishlistId ? updated : w)));
    return Promise.resolve(updated);
  },

  removeListing(userId, listingId) {
    store.set(
      userId,
      listsOf(userId).map((w) =>
        w.listingIds.includes(listingId) ? { ...w, listingIds: w.listingIds.filter((id) => id !== listingId) } : w,
      ),
    );
    return Promise.resolve();
  },
};
