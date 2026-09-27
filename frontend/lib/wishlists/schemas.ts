import { z } from "zod";

export const WISHLIST_NAME_MAX = 50;

export const wishlistNameSchema = z
  .string()
  .trim()
  .min(1, "Give your wishlist a name")
  .max(WISHLIST_NAME_MAX, `Wishlist names can be at most ${WISHLIST_NAME_MAX} characters`);

export const createWishlistSchema = z.object({
  name: wishlistNameSchema,
  listingId: z.string().min(1).max(50).optional(),
});

export const addListingSchema = z.object({ listingId: z.string().min(1).max(50) });
