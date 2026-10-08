import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const fetchAvailability = vi.fn();
vi.mock("@/lib/api-client/availability", () => ({ fetchAvailability: (id: string) => fetchAvailability(id) }));

import { useReservationState } from "./use-reservation-state";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useReservationState with booked nights", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2031, 0, 15));
    fetchAvailability.mockReset();
    fetchAvailability.mockResolvedValue([{ checkIn: "2031-02-10", checkOut: "2031-02-13" }]);
  });
  afterEach(() => vi.useRealTimers());

  async function ready() {
    const hook = renderHook(() => useReservationState("l1", 100, 4), { wrapper });
    await waitFor(() => expect(hook.result.current.blockedRanges).toHaveLength(1));
    return hook;
  }

  test("a check-out past booked nights restarts the selection there", async () => {
    const { result } = await ready();
    act(() => result.current.select(new Date(2031, 1, 7)));
    act(() => result.current.select(new Date(2031, 1, 15)));
    expect(result.current.checkIn).toEqual(new Date(2031, 1, 15));
    expect(result.current.checkOut).toBeNull();
  });

  test("prefilled dates over booked nights lose their check-out", async () => {
    const init = { checkIn: new Date(2031, 1, 8), checkOut: new Date(2031, 1, 12), adults: 1, children: 0 };
    const { result } = renderHook(() => useReservationState("l1", 100, 4, init), { wrapper });
    await waitFor(() => expect(result.current.blockedRanges).toHaveLength(1));
    await waitFor(() => expect(result.current.checkOut).toBeNull());
    expect(result.current.checkIn).toEqual(init.checkIn);
    expect(result.current.bookHref).toBeNull();
  });

  test("checking out on the day a booking starts is allowed", async () => {
    const { result } = await ready();
    act(() => result.current.select(new Date(2031, 1, 7)));
    act(() => result.current.select(new Date(2031, 1, 10)));
    expect(result.current.checkOut).toEqual(new Date(2031, 1, 10));
  });
});
