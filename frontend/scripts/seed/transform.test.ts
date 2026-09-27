import { describe, expect, it } from "vitest";
import type { Experience, Review } from "@/lib/types";
import { toBackendReviews, toCreatedAt, withSortOrder } from "./transform";

describe("toCreatedAt", () => {
  it("turns the mock's month-year text into the first of that month in UTC", () => {
    expect(toCreatedAt("March 2026")).toBe("2026-03-01T00:00:00Z");
    expect(toCreatedAt("December 2025")).toBe("2025-12-01T00:00:00Z");
  });

  it.each(["Mar 2026", "March", "2026-03-01", ""])("rejects %j with a message naming the value", (date) => {
    expect(() => toCreatedAt(date)).toThrow(`Unexpected review date: "${date}"`);
  });
});

describe("withSortOrder", () => {
  it("adds each item's array position as sortOrder", () => {
    expect(withSortOrder([{ id: "a" }, { id: "b" }])).toEqual([
      { id: "a", sortOrder: 0 },
      { id: "b", sortOrder: 1 },
    ]);
  });
});

describe("toBackendReviews", () => {
  const review = (id: string, listingId: string): Review => ({
    id,
    listingId,
    authorName: "Sarah",
    authorAvatar: "https://images.unsplash.com/a.jpg",
    date: "March 2026",
    rating: 5,
    body: "Great",
  });
  const experiences = [{ id: "e1" }] as Experience[];

  it("types experience reviews by the experience ids and everything else as stays", () => {
    const [stay, experience] = toBackendReviews([review("l1-r1", "l1"), review("re1", "e1")], experiences);

    expect(stay).toEqual({
      id: "l1-r1",
      authorName: "Sarah",
      authorAvatar: "https://images.unsplash.com/a.jpg",
      rating: 5,
      body: "Great",
      subjectType: "stay",
      subjectId: "l1",
      createdAt: "2026-03-01T00:00:00Z",
    });
    expect(experience.subjectType).toBe("experience");
    expect(experience.subjectId).toBe("e1");
  });
});
