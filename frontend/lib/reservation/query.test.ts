import { describe, expect, test } from "vitest";
import { parseReservationQuery, type ReservationQuery } from "./query";

const today = new Date(2031, 0, 15);

describe("parseReservationQuery", () => {
  test("reads valid future dates and guest counts", () => {
    expect(parseReservationQuery({ checkIn: "2031-02-01", checkOut: "2031-02-04", adults: "2", children: "1" }, today)).toEqual({
      checkIn: new Date(2031, 1, 1),
      checkOut: new Date(2031, 1, 4),
      adults: 2,
      children: 1,
    });
  });

  test.each<[ReservationQuery, string]>([
    [{ checkIn: "2031-01-10", checkOut: "2031-01-20" }, "a past check-in"],
    [{ checkIn: "2031-02-04", checkOut: "2031-02-01" }, "check-out before check-in"],
    [{ checkIn: "2031-02-04", checkOut: "2031-02-04" }, "zero nights"],
    [{ checkIn: "2031-02-30", checkOut: "2031-03-02" }, "an impossible day"],
    [{ checkIn: "tomorrow", checkOut: "2031-03-02" }, "not an ISO date"],
    [{ checkIn: "2031-02-01" }, "a missing check-out"],
  ])("drops the dates for %o (%s)", (query) => {
    const parsed = parseReservationQuery(query, today);
    expect(parsed.checkIn).toBeNull();
    expect(parsed.checkOut).toBeNull();
  });

  test("falls back to 1 adult and 0 children for bad counts", () => {
    expect(parseReservationQuery({ adults: "0", children: "-1" }, today)).toMatchObject({ adults: 1, children: 0 });
    expect(parseReservationQuery({ adults: "1.5", children: "abc" }, today)).toMatchObject({ adults: 1, children: 0 });
  });
});
