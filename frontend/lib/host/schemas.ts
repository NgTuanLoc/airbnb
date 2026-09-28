import { z } from "zod";
import { AMENITY_OPTIONS, HOST_CATEGORIES, HOST_CITIES, MAX_PHOTOS, PHOTO_OPTIONS, PROPERTY_TYPES } from "./options";

const oneOf = (values: readonly string[], message: string) => z.string().refine((value) => values.includes(value), message);
const unique = (values: string[]) => new Set(values).size === values.length;
const TITLE = "Titles need 5–80 characters";
const DESCRIPTION = "Descriptions need 20–1000 characters";
const PHOTOS = "Pick 1 to 5 photos";
const PRICE = "Price must be between $10 and $10,000";

/** A host's listing as the form and the API take it: shared, so both validate the same way. */
export const hostListingInputSchema = z.object({
  title: z.string().trim().min(5, TITLE).max(80, TITLE),
  description: z.string().trim().min(20, DESCRIPTION).max(1000, DESCRIPTION),
  propertyType: oneOf(PROPERTY_TYPES, "Pick a property type"),
  category: oneOf(HOST_CATEGORIES, "Pick a category"),
  cityId: oneOf(HOST_CITIES.map((city) => city.id), "Pick a city"),
  maxGuests: z.number().int().min(1).max(16),
  bedrooms: z.number().int().min(0).max(20),
  beds: z.number().int().min(1).max(30),
  baths: z.number().min(0.5).max(20).refine((value) => Number.isInteger(value * 2), "Baths go in steps of 0.5"),
  amenities: z.array(oneOf(AMENITY_OPTIONS, "Unknown amenity")).refine(unique, "Amenities must be unique"),
  photos: z.array(oneOf(PHOTO_OPTIONS, PHOTOS)).min(1, PHOTOS).max(MAX_PHOTOS, PHOTOS).refine(unique, PHOTOS),
  pricePerNight: z.number().int(PRICE).min(10, PRICE).max(10000, PRICE),
});

export type HostListingInput = z.infer<typeof hostListingInputSchema>;

export const listingStatusSchema = z.object({ status: z.enum(["listed", "unlisted"]) });
