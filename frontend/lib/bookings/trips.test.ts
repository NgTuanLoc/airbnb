import { expect, test } from "vitest";
import { splitTrips } from "./trips";
import type { Booking } from "@/lib/types";

const trip = (id: string, checkIn: string, checkOut: string) =>
  ({ id, checkIn, checkOut }) as Booking;

test("splits upcoming (soonest first) from past (most recent first)", () => {
  const { upcoming, past } = splitTrips(
    [
      trip("a", "2026-01-01", "2026-01-03"),
      trip("b", "2026-06-10", "2026-06-12"),
      trip("c", "2026-02-01", "2026-02-05"),
      trip("d", "2026-05-01", "2026-05-20"),
      trip("e", "2026-05-20", "2026-05-22"),
    ],
    "2026-05-20",
  );

  expect(upcoming.map((t) => t.id)).toEqual(["d", "e", "b"]);
  expect(past.map((t) => t.id)).toEqual(["c", "a"]);
});
