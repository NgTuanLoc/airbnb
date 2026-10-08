import { describe, expect, test } from "vitest";
import { isNightBooked, isStayFree } from "./availability";

const stays = [{ checkIn: "2031-02-10", checkOut: "2031-02-13" }];

describe("availability", () => {
  test("nights inside [checkIn, checkOut) are booked; the check-out day is not", () => {
    expect(isNightBooked("2031-02-10", stays)).toBe(true);
    expect(isNightBooked("2031-02-12", stays)).toBe(true);
    expect(isNightBooked("2031-02-13", stays)).toBe(false);
    expect(isNightBooked("2031-02-09", stays)).toBe(false);
  });

  test("a stay is free only when none of its nights is booked; back-to-back stays are free", () => {
    expect(isStayFree("2031-02-07", "2031-02-10", stays)).toBe(true);
    expect(isStayFree("2031-02-13", "2031-02-15", stays)).toBe(true);
    expect(isStayFree("2031-02-08", "2031-02-11", stays)).toBe(false);
    expect(isStayFree("2031-02-05", "2031-02-20", stays)).toBe(false);
  });
});
