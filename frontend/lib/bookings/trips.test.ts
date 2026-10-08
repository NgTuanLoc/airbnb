import { expect, test } from "vitest";
import { splitTrips } from "./trips";
import type { Booking } from "@/lib/types";

const trip = (id: string, checkIn: string, checkOut: string, status: Booking["status"] = "confirmed") =>
  ({ id, checkIn, checkOut, status }) as Booking;

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

test("cancelled trips go only to cancelled, most recent check-in first", () => {
  const { upcoming, past, cancelled } = splitTrips(
    [
      trip("a", "2026-06-10", "2026-06-12", "cancelled"),
      trip("b", "2026-01-01", "2026-01-03", "cancelled"),
      trip("c", "2026-07-01", "2026-07-03", "cancelled"),
    ],
    "2026-05-20",
  );

  expect(upcoming).toEqual([]);
  expect(past).toEqual([]);
  expect(cancelled.map((t) => t.id)).toEqual(["c", "a", "b"]);
});
