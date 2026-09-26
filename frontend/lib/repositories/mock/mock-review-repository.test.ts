import { describe, expect, test } from "vitest";
import { mockReviewRepository } from "./mock-review-repository";

describe("mockReviewRepository", () => {
  test("findByListingId returns only that listing's reviews", async () => {
    const result = await mockReviewRepository.findByListingId("l1");
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.listingId === "l1")).toBe(true);
  });

  test("findByListingId returns an empty array for an unknown listing", async () => {
    expect(await mockReviewRepository.findByListingId("nope")).toEqual([]);
  });
});
