import { describe, expect, test } from "vitest";
import { hostListingInputSchema, listingStatusSchema } from "./schemas";
import { AMENITY_OPTIONS, HOST_CITIES, PHOTO_OPTIONS } from "./options";
import { validInput } from "./test-fixtures";

function firstError(override: Record<string, unknown>): string | undefined {
  const parsed = hostListingInputSchema.safeParse({ ...validInput, ...override });
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

describe("hostListingInputSchema", () => {
  test("accepts a valid listing and trims the text", () => {
    const parsed = hostListingInputSchema.parse(validInput);
    expect(parsed.title).toBe("Sunny cabin by the lake");
  });

  test("offers six cities and twelve gallery photos", () => {
    expect(HOST_CITIES.map((c) => c.id)).toEqual(["wilmington", "athens", "aspen", "malibu", "kyoto", "lisbon"]);
    expect(PHOTO_OPTIONS).toHaveLength(12);
    expect(PHOTO_OPTIONS.every((url) => url.startsWith("https://images.unsplash.com/"))).toBe(true);
    expect(AMENITY_OPTIONS).toContain("Pool");
  });

  test.each([
    [{ title: "Hut" }, "Titles need 5–80 characters"],
    [{ title: "x".repeat(81) }, "Titles need 5–80 characters"],
    [{ description: "Too short" }, "Descriptions need 20–1000 characters"],
    [{ propertyType: "Castle" }, "Pick a property type"],
    [{ category: "All" }, "Pick a category"],
    [{ cityId: "paris" }, "Pick a city"],
    [{ photos: [] }, "Pick 1 to 5 photos"],
    [{ photos: ["https://evil.example.com/x.jpg"] }, "Pick 1 to 5 photos"],
    [{ photos: PHOTO_OPTIONS.slice(0, 6) }, "Pick 1 to 5 photos"],
    [{ photos: [PHOTO_OPTIONS[0], PHOTO_OPTIONS[0]] }, "Pick 1 to 5 photos"],
    [{ amenities: ["Helipad"] }, "Unknown amenity"],
    [{ pricePerNight: 9 }, "Price must be between $10 and $10,000"],
    [{ pricePerNight: 10001 }, "Price must be between $10 and $10,000"],
    [{ pricePerNight: 99.5 }, "Price must be between $10 and $10,000"],
  ])("rejects %o", (override, message) => {
    expect(firstError(override)).toBe(message);
  });

  test.each([{ maxGuests: 0 }, { maxGuests: 17 }, { bedrooms: -1 }, { beds: 0 }, { baths: 0 }, { baths: 1.3 }])(
    "rejects out-of-range size %o",
    (override) => {
      expect(firstError(override)).toBeDefined();
    },
  );

  test("the status body is listed or unlisted", () => {
    expect(listingStatusSchema.parse({ status: "unlisted" }).status).toBe("unlisted");
    expect(listingStatusSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });
});
