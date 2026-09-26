import { describe, expect, test } from "vitest";
import { mockServiceRepository } from "./mock-service-repository";

describe("mockServiceRepository", () => {
  test("findAll with no filter returns all services", async () => {
    const all = await mockServiceRepository.findAll();
    expect(all.length).toBeGreaterThanOrEqual(12);
  });

  test("findAll filters by service category", async () => {
    const photo = await mockServiceRepository.findAll({ category: "Photography" });
    expect(photo.length).toBeGreaterThan(0);
    expect(photo.every((s) => s.serviceCategory === "Photography")).toBe(true);
  });

  test('findAll with category "All" returns everything', async () => {
    const all = await mockServiceRepository.findAll({ category: "All" });
    const unfiltered = await mockServiceRepository.findAll();
    expect(all.length).toBe(unfiltered.length);
  });

  test("findById returns the matching service or null", async () => {
    const first = await mockServiceRepository.findById("s1");
    expect(first?.id).toBe("s1");
    expect(await mockServiceRepository.findById("nope")).toBeNull();
  });
});
