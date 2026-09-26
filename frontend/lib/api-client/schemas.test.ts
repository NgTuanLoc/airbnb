import { describe, expect, test } from "vitest";
import { listingSchema, experiencesEnvelopeSchema, servicesEnvelopeSchema } from "./schemas";

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

describe("experiencesEnvelopeSchema", () => {
  test("parses a valid experience envelope", () => {
    const parsed = experiencesEnvelopeSchema.parse({
      success: true,
      data: [
        { id: "e1", title: "x", location: { city: "Rome", country: "Italy", lat: 1, lng: 2 }, photos: ["/a.jpg"], pricePerPerson: 65, durationHours: 3, rating: 4.9, reviewCount: 10, isNew: false, hostId: "h1", category: "Food & drink", description: "d" },
      ],
    });
    expect(parsed.data?.[0]?.id).toBe("e1");
  });
});

describe("servicesEnvelopeSchema", () => {
  test("parses a valid service envelope", () => {
    const parsed = servicesEnvelopeSchema.parse({
      success: true,
      data: [
        { id: "s1", title: "x", provider: "P", serviceCategory: "Photography", photos: ["/a.jpg"], price: 180, rating: 4.9, reviewCount: 10, city: "Lisbon", description: "d" },
      ],
    });
    expect(parsed.data?.[0]?.id).toBe("s1");
  });
});
