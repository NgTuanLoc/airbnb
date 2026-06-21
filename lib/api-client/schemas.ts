import { z } from "zod";

export const listingSchema = z.object({
  id: z.string(),
  title: z.string(),
  location: z.object({
    city: z.string(),
    country: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  photos: z.array(z.string()).min(1),
  pricePerNight: z.number().positive(),
  rating: z.number(),
  reviewCount: z.number(),
  isGuestFavorite: z.boolean(),
  hostId: z.string(),
  category: z.string(),
  description: z.string(),
  propertyType: z.string(),
  maxGuests: z.number().int().positive(),
  bedrooms: z.number().int().nonnegative(),
  beds: z.number().int().nonnegative(),
  baths: z.number().nonnegative(),
  amenities: z.array(z.string()),
});

export const listingsEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.array(listingSchema).optional(),
  error: z.string().optional(),
  meta: z
    .object({ total: z.number(), page: z.number(), limit: z.number() })
    .optional(),
});
