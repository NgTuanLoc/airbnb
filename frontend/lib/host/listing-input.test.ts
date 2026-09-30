import { describe, expect, test } from "vitest";
import { hostListingInputSchema } from "./schemas";
import { validInput } from "./test-fixtures";
import { HOST_CITIES } from "./options";
import { buildHostListing, coordinateOffset, toHostListingInput } from "./listing-input";

const input = hostListingInputSchema.parse(validInput);
const city = HOST_CITIES.find((c) => c.id === input.cityId)!;

describe("host listing coordinates", () => {
  test("offsets stay within 0.02 degrees and are stable per id", () => {
    for (const id of ["hl-a", "hl-b", "hl-c", "hl-0f3e"]) {
      const offset = coordinateOffset(id, "lat");
      expect(Math.abs(offset)).toBeLessThanOrEqual(0.02);
      expect(coordinateOffset(id, "lat")).toBe(offset);
    }
  });

  test("two listings in one city get different map positions near the city", () => {
    const a = buildHostListing("hl-a", "u-x", input, "listed");
    const b = buildHostListing("hl-b", "u-x", input, "listed");
    expect([a.location.lat, a.location.lng]).not.toEqual([b.location.lat, b.location.lng]);
    expect(Math.abs(a.location.lat - city.lat)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(a.location.lng - city.lng)).toBeLessThanOrEqual(0.02);
  });
});

describe("toHostListingInput", () => {
  test("prefills the city from the stored cityId even if the city name changed", () => {
    const listing = { ...buildHostListing("hl-a", "u-x", input, "listed"), location: { ...buildHostListing("hl-a", "u-x", input, "listed").location, city: "Renamed" } };
    expect(toHostListingInput(listing).cityId).toBe(input.cityId);
  });

  test("falls back to the city name for listings without a cityId", () => {
    const built = buildHostListing("hl-a", "u-x", input, "listed");
    const listing = { ...built, cityId: undefined };
    expect(toHostListingInput(listing).cityId).toBe(input.cityId);
  });
});
