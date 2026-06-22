import { describe, expect, test } from "vitest";
import { experiencesEnvelopeSchema, servicesEnvelopeSchema } from "./schemas";

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
