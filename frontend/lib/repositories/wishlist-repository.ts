import type { Wishlist } from "@/lib/types";

// Every method is scoped by userId: one guest can never read or change another guest's lists.
export interface WishlistRepository {
  /** Newest first. */
  listForUser(userId: string): Promise<Wishlist[]>;
  findById(userId: string, id: string): Promise<Wishlist | null>;
  create(userId: string, name: string): Promise<Wishlist>;
  /** Null when the list isn't the user's; adding a listing twice is a no-op. */
  addListing(userId: string, wishlistId: string, listingId: string): Promise<Wishlist | null>;
  /** Removes the listing from every list of the user. */
  removeListing(userId: string, listingId: string): Promise<void>;
}
