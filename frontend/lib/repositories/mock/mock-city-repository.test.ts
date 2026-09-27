import { describe, expect, test } from "vitest";
import { mockCityRepository } from "./mock-city-repository";

describe("mockCityRepository", () => {
  test("findAll returns every city in mock order", async () => {
    const cities = await mockCityRepository.findAll();
    expect(cities.map((c) => c.id)).toEqual(["wilmington", "athens", "aspen", "malibu", "kyoto", "lisbon"]);
  });
});
