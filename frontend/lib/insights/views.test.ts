import { describe, expect, test } from "vitest";
import { LISTING_ID_PATTERN, guestViewsText, hostViewsText } from "./views";

const weekly = (last7Days: number, previous7Days: number) => ({ listingId: "l1", last7Days, previous7Days });

describe("LISTING_ID_PATTERN", () => {
  test.each(["l1", "l16", "hl-0192f3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a"])("accepts %s", (id) => {
    expect(LISTING_ID_PATTERN.test(id)).toBe(true);
  });

  test.each(["", "..", "l", "L1", "l1234567", "hl-x", "l1/../l2", "l1\n"])("refuses %j", (id) => {
    expect(LISTING_ID_PATTERN.test(id)).toBe(false);
  });
});

describe("guestViewsText", () => {
  test("says nothing without views or stats", () => {
    expect(guestViewsText(null)).toBeNull();
    expect(guestViewsText(weekly(0, 12))).toBeNull();
  });

  test("counts views, not people", () => {
    expect(guestViewsText(weekly(1, 0))).toBe("1 view in the past week");
    expect(guestViewsText(weekly(48, 30))).toBe("48 views in the past week");
  });
});

describe("hostViewsText", () => {
  test("no views, and no comparison when the week before had none", () => {
    expect(hostViewsText(weekly(0, 0))).toBe("No views in the last 7 days");
    expect(hostViewsText(weekly(1, 0))).toBe("1 view in the last 7 days");
  });

  test("compares with the week before", () => {
    expect(hostViewsText(weekly(132, 112))).toBe("132 views in the last 7 days · ↑ 18% vs. the week before");
    expect(hostViewsText(weekly(95, 100))).toBe("95 views in the last 7 days · ↓ 5% vs. the week before");
    expect(hostViewsText(weekly(0, 10))).toBe("No views in the last 7 days · ↓ 100% vs. the week before");
  });

  test("a change that rounds to 0% reads as the same", () => {
    expect(hostViewsText(weekly(10, 10))).toBe("10 views in the last 7 days · same as the week before");
    expect(hostViewsText(weekly(1001, 1000))).toBe("1001 views in the last 7 days · same as the week before");
  });
});
