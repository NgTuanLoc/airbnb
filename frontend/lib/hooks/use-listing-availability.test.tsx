import { describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const fetchAvailability = vi.fn();
vi.mock("@/lib/api-client/availability", () => ({ fetchAvailability: (id: string) => fetchAvailability(id) }));

import { useListingAvailability } from "./use-listing-availability";

describe("useListingAvailability", () => {
  test("refetches on every mount because cached availability is never fresh", async () => {
    fetchAvailability.mockResolvedValue([]);
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

    const first = renderHook(() => useListingAvailability("l1"), { wrapper });
    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(1));
    first.unmount();
    renderHook(() => useListingAvailability("l1"), { wrapper });

    await waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(2));
    expect(client.getQueryCache().find({ queryKey: ["availability", "l1"] })?.isStale()).toBe(true);
  });
});
