import { describe, expect, test } from "vitest";
import { act, renderHook } from "@/lib/test-utils";
import { buildSearchUrl, useSearchForm } from "./use-search-form";

describe("buildSearchUrl", () => {
  test("uses 'anywhere' without a destination and omits empty params", () => {
    expect(buildSearchUrl("  ", { adults: 0, children: 0 }, null, null)).toBe("/s/anywhere");
  });

  test("encodes the destination and adds guests and dates", () => {
    const url = buildSearchUrl("New York", { adults: 2, children: 1 }, new Date(2031, 2, 5), new Date(2031, 2, 8));
    expect(url).toBe("/s/New%20York?guests=3&checkIn=2031-03-05&checkOut=2031-03-08");
  });
});

describe("useSearchForm", () => {
  test("selects a check-in, then a later check-out, and restarts on an earlier day", () => {
    const { result } = renderHook(() => useSearchForm());
    act(() => result.current.selectDate(new Date(2031, 2, 5)));
    act(() => result.current.selectDate(new Date(2031, 2, 8)));
    expect(result.current.whenLabel).toBe("Mar 5 – Mar 8");
    act(() => result.current.selectDate(new Date(2031, 2, 1)));
    expect(result.current.checkIn).toEqual(new Date(2031, 2, 1));
    expect(result.current.checkOut).toBeNull();
  });

  test("builds the url from its state and clear() resets everything", () => {
    const { result } = renderHook(() => useSearchForm());
    act(() => {
      result.current.setDestination("Aspen");
      result.current.setGuests({ adults: 2, children: 0 });
    });
    expect(result.current.url).toBe("/s/Aspen?guests=2");
    expect(result.current.whoLabel).toBe("2 guests");
    act(() => result.current.clear());
    expect(result.current.url).toBe("/s/anywhere");
    expect(result.current.whoLabel).toBe("Add guests");
  });
});
