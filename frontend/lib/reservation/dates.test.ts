import { expect, test } from "vitest";
import { formatDateRange, toIsoDate } from "./dates";

test("toIsoDate uses the local calendar day", () => {
  expect(toIsoDate(new Date(2026, 2, 5))).toBe("2026-03-05");
  expect(toIsoDate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
});

test("formatDateRange shows both dates in words", () => {
  expect(formatDateRange("2026-03-05", "2026-03-08")).toBe("Mar 5, 2026 – Mar 8, 2026");
});
