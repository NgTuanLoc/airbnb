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

export const experienceSchema = z.object({
  id: z.string(),
  title: z.string(),
  location: z.object({ city: z.string(), country: z.string(), lat: z.number(), lng: z.number() }),
  photos: z.array(z.string()).min(1),
  pricePerPerson: z.number().positive(),
  durationHours: z.number().positive(),
  rating: z.number(),
  reviewCount: z.number(),
  isNew: z.boolean(),
  hostId: z.string(),
  category: z.string(),
  description: z.string(),
});

export const experiencesEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.array(experienceSchema).optional(),
  error: z.string().optional(),
  meta: z.object({ total: z.number(), page: z.number(), limit: z.number() }).optional(),
});

export const serviceSchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: z.string(),
  serviceCategory: z.string(),
  photos: z.array(z.string()).min(1),
  price: z.number().positive(),
  rating: z.number(),
  reviewCount: z.number(),
  city: z.string(),
  description: z.string(),
});

export const servicesEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.array(serviceSchema).optional(),
  error: z.string().optional(),
  meta: z.object({ total: z.number(), page: z.number(), limit: z.number() }).optional(),
});

const pageMetaSchema = z.object({ total: z.number(), page: z.number(), limit: z.number() });

/** The backend's `{ success, data?, error?, meta? }` envelope around any payload schema. */
export function envelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({
    success: z.boolean(),
    data: data.optional(),
    error: z.string().optional(),
    meta: pageMetaSchema.optional(),
  });
}

export const hostSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string(),
  isSuperhost: z.boolean(),
  responseRate: z.number(),
  joinedYear: z.number().int(),
});

export const citySchema = z.object({
  id: z.string(),
  name: z.string(),
  subLabel: z.string(),
  image: z.string(),
  listingCount: z.number().int().nonnegative(),
});

/** The backend's review shape; the HTTP repository maps it to the frontend `Review`. */
export const reviewDtoSchema = z.object({
  id: z.string(),
  subjectType: z.enum(["stay", "experience"]),
  subjectId: z.string(),
  authorName: z.string(),
  authorAvatar: z.string(),
  rating: z.number(),
  body: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});

export type ReviewDto = z.infer<typeof reviewDtoSchema>;

export const userSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });

const priceBreakdownSchema = z.object({
  lineItems: z.array(z.object({ label: z.string(), amount: z.number() })),
  total: z.number(),
});

export const wishlistSchema = z.object({
  id: z.string(),
  name: z.string(),
  listingIds: z.array(z.string()),
  createdAt: z.string(),
});

export const bookingSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.object({ adults: z.number(), children: z.number() }),
  priceBreakdown: priceBreakdownSchema,
  status: z.literal("confirmed"),
  createdAt: z.string(),
});
