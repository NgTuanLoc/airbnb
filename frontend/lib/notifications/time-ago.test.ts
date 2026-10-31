import { describe, expect, test } from "vitest";
import { timeAgo } from "./time-ago";

const now = new Date("2026-10-31T12:00:00Z");
const before = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe("timeAgo", () => {
  test.each([
    [0, "Just now"],
    [59, "Just now"],
    [60, "1 minute ago"],
    [45 * 60, "45 minutes ago"],
    [60 * 60, "1 hour ago"],
    [23 * 60 * 60, "23 hours ago"],
    [24 * 60 * 60, "Yesterday"],
    [3 * 24 * 60 * 60, "3 days ago"],
  ])("%i seconds before reads %s", (seconds, expected) => {
    expect(timeAgo(before(seconds), now)).toBe(expected);
  });

  test("a time a little ahead of this clock still reads as just now", () => {
    expect(timeAgo(before(-30), now)).toBe("Just now");
  });
});
