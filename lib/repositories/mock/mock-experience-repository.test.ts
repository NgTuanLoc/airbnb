import { describe, expect, test } from "vitest";
import { mockExperienceRepository } from "./mock-experience-repository";

describe("mockExperienceRepository", () => {
  test("findAll with no filter returns all experiences", async () => {
    const all = await mockExperienceRepository.findAll();
    expect(all.length).toBeGreaterThanOrEqual(12);
  });

  test("findAll filters by category", async () => {
    const food = await mockExperienceRepository.findAll({ category: "Food & drink" });
    expect(food.length).toBeGreaterThan(0);
    expect(food.every((e) => e.category === "Food & drink")).toBe(true);
  });

  test('findAll with category "All" returns everything', async () => {
    const all = await mockExperienceRepository.findAll({ category: "All" });
    const unfiltered = await mockExperienceRepository.findAll();
    expect(all.length).toBe(unfiltered.length);
  });

  test("findById returns the matching experience or null", async () => {
    const first = await mockExperienceRepository.findById("e1");
    expect(first?.id).toBe("e1");
    expect(await mockExperienceRepository.findById("nope")).toBeNull();
  });
});
