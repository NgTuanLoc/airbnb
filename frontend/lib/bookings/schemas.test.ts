import { describe, expect, test } from "vitest";
import { MAX_NIGHTS, bookingRequestSchema, nightsBetweenDates } from "./schemas";

const DAY = 86_400_000;
const daysFromToday = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

function firstError(input: Record<string, unknown>): string | undefined {
  const parsed = bookingRequestSchema.safeParse(input);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

const valid = { listingId: "l1", checkIn: daysFromToday(10), checkOut: daysFromToday(13), adults: 2, children: 1 };

describe("bookingRequestSchema", () => {
  test("accepts a valid request, coercing query-string numbers", () => {
    const parsed = bookingRequestSchema.parse({ ...valid, adults: "2", children: "1" });
    expect(parsed).toEqual(valid);
  });

  test("defaults children to 0", () => {
    const withoutChildren = { listingId: valid.listingId, checkIn: valid.checkIn, checkOut: valid.checkOut, adults: 2 };
    expect(bookingRequestSchema.parse(withoutChildren).children).toBe(0);
  });

  test("allows check-in today (one day of slack for timezones)", () => {
    expect(firstError({ ...valid, checkIn: daysFromToday(-1), checkOut: daysFromToday(1) })).toBeUndefined();
  });

  test.each([
    [{ checkIn: daysFromToday(-3), checkOut: daysFromToday(1) }, "Check-in can't be in the past"],
    [{ checkOut: valid.checkIn }, "Check-out must be after check-in"],
    [{ checkOut: daysFromToday(10 + MAX_NIGHTS + 1) }, `Stays can be at most ${MAX_NIGHTS} nights`],
    [{ adults: 0 }, "At least 1 adult is required"],
    [{ checkIn: "2030-02-30" }, "Enter a real date"],
    [{ checkIn: "10/01/2030" }, "Dates must be YYYY-MM-DD"],
  ])("rejects %o", (override, message) => {
    expect(firstError({ ...valid, ...override })).toBe(message);
  });
});

test("nightsBetweenDates counts calendar nights", () => {
  expect(nightsBetweenDates("2030-03-30", "2030-04-02")).toBe(3);
});
