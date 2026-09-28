import { describe, expect, test } from "vitest";
import { listingSchema, experiencesEnvelopeSchema, servicesEnvelopeSchema, envelopeSchema, hostSchema, citySchema, reviewDtoSchema } from "./schemas";

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

describe("envelopeSchema", () => {
  test("parses a single-item envelope", () => {
    const parsed = envelopeSchema(hostSchema).parse({
      success: true,
      data: { id: "h1", name: "Maya", avatar: "https://example.com/a.jpg", isSuperhost: true, responseRate: 98, joinedYear: 2019 },
    });
    expect(parsed.data?.name).toBe("Maya");
  });

  test("parses an error envelope without data", () => {
    const parsed = envelopeSchema(hostSchema).parse({ success: false, error: "Host 'x' was not found" });
    expect(parsed.error).toBe("Host 'x' was not found");
  });
});

describe("citySchema", () => {
  test("parses a city", () => {
    const city = { id: "aspen", name: "Aspen", subLabel: "Colorado", image: "https://example.com/c.jpg", listingCount: 4 };
    expect(citySchema.parse(city)).toEqual(city);
  });
});

describe("reviewDtoSchema", () => {
  const dto = {
    id: "l1-r1",
    subjectType: "stay",
    subjectId: "l1",
    authorName: "Sarah",
    authorAvatar: "https://example.com/a.jpg",
    rating: 5,
    body: "Lovely",
    createdAt: "2026-03-01T00:00:00+00:00",
  };

  test("accepts offset and Z timestamps", () => {
    expect(reviewDtoSchema.parse(dto).subjectId).toBe("l1");
    expect(reviewDtoSchema.parse({ ...dto, createdAt: "2026-03-01T00:00:00Z" }).createdAt).toBe("2026-03-01T00:00:00Z");
  });

  test("rejects a preformatted date and an unknown subject type", () => {
    expect(() => reviewDtoSchema.parse({ ...dto, createdAt: "March 2026" })).toThrow();
    expect(() => reviewDtoSchema.parse({ ...dto, subjectType: "service" })).toThrow();
  });
});

describe("listingSchema status", () => {
  const base = listingSchema.parse({
    id: "l1", title: "Cozy cabin", location: { city: "Aspen", country: "USA", lat: 39.19, lng: -106.82 },
    photos: ["https://example.com/a.jpg"], pricePerNight: 220, rating: 4.92, reviewCount: 88, isGuestFavorite: true,
    hostId: "h1", category: "Cabins", description: "A warm cabin in the pines.", propertyType: "Entire cabin",
    maxGuests: 4, bedrooms: 2, beds: 3, baths: 1, amenities: ["Wifi"],
  });

  test("accepts listings with no status, listed or unlisted", () => {
    expect(listingSchema.parse({ ...base, status: "unlisted" }).status).toBe("unlisted");
    expect(listingSchema.parse({ ...base, status: "listed" }).status).toBe("listed");
    expect(base.status).toBeUndefined();
  });

  test("rejects other statuses", () => {
    expect(() => listingSchema.parse({ ...base, status: "draft" })).toThrow();
  });
});
