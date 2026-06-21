import { describe, expect, test } from "vitest";
import { nightsBetween, calculatePriceBreakdown } from "./pricing";

describe("nightsBetween", () => {
  test("counts whole nights between two dates", () => {
    expect(nightsBetween(new Date(2026, 5, 1), new Date(2026, 5, 6))).toBe(5);
  });

  test("returns 0 when check-out is not after check-in", () => {
    expect(nightsBetween(new Date(2026, 5, 6), new Date(2026, 5, 6))).toBe(0);
  });
});

describe("calculatePriceBreakdown", () => {
  test("builds line items and a total for a multi-night stay", () => {
    const breakdown = calculatePriceBreakdown(220, 5);
    // 220*5 = 1100 nightly, 75 cleaning, round(0.14*1100)=154 service => 1329 total
    expect(breakdown.total).toBe(1329);
    expect(breakdown.lineItems[0]).toEqual({ label: "$220 x 5 nights", amount: 1100 });
    expect(breakdown.lineItems.map((i) => i.label)).toContain("Cleaning fee");
    expect(breakdown.lineItems.map((i) => i.label)).toContain("Airbnb service fee");
  });

  test("uses singular night label for a one-night stay", () => {
    expect(calculatePriceBreakdown(100, 1).lineItems[0].label).toBe("$100 x 1 night");
  });
});
