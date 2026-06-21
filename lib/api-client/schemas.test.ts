import { describe, expect, test } from "vitest";
import { listingSchema } from "./schemas";

describe("listingSchema", () => {
  test("parses a full listing including detail fields", () => {
    const listing = {
      id: "l1",
      title: "Cozy cabin",
      location: { city: "Aspen", country: "USA", lat: 39.19, lng: -106.82 },
      photos: ["https://example.com/a.jpg"],
      pricePerNight: 220,
      rating: 4.92,
      reviewCount: 88,
      isGuestFavorite: true,
      hostId: "h1",
      category: "Cabins",
      description: "A warm cabin in the pines.",
      propertyType: "Entire cabin",
      maxGuests: 4,
      bedrooms: 2,
      beds: 3,
      baths: 1,
      amenities: ["Wifi", "Kitchen"],
    };
    expect(listingSchema.parse(listing)).toMatchObject({ propertyType: "Entire cabin", maxGuests: 4 });
  });

  test("rejects a listing missing detail fields", () => {
    expect(() => listingSchema.parse({ id: "x" })).toThrow();
  });
});
