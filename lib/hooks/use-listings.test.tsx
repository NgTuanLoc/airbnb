import { describe, expect, test, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useListings } from "./use-listings";
import * as api from "@/lib/api-client/listings";
import type { Listing } from "@/lib/types";

const sample: Listing = {
  id: "l1", title: "Cabin", location: { city: "Aspen", country: "USA", lat: 39, lng: -106 },
  photos: ["x"], pricePerNight: 220, rating: 4.9, reviewCount: 10, isGuestFavorite: true, hostId: "h1", category: "Cabins",
  description: "A lovely place to stay.",
  propertyType: "Entire home",
  maxGuests: 4,
  bedrooms: 2,
  beds: 2,
  baths: 1,
  amenities: ["Wifi", "Kitchen"],
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.restoreAllMocks());

describe("useListings", () => {
  test("returns listings from the api-client", async () => {
    vi.spyOn(api, "fetchListings").mockResolvedValue([sample]);
    const { result } = renderHook(() => useListings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([sample]);
  });

  test("passes the category through to fetchListings", async () => {
    const spy = vi.spyOn(api, "fetchListings").mockResolvedValue([]);
    const { result } = renderHook(() => useListings("Beachfront"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith("Beachfront");
  });

  test("keeps previous data while a new category query is fetching", async () => {
    const first: Listing = { ...sample, id: "a" };
    const second: Listing = { ...sample, id: "b" };
    const spy = vi
      .spyOn(api, "fetchListings")
      .mockResolvedValueOnce([first])
      .mockResolvedValueOnce([second]);

    const { result, rerender } = renderHook(({ c }) => useListings(c), {
      wrapper,
      initialProps: { c: "All" },
    });
    await waitFor(() => expect(result.current.data).toEqual([first]));

    rerender({ c: "Cabins" });
    // Immediately after switching keys, previous data is retained as placeholder.
    expect(result.current.data).toEqual([first]);
    expect(result.current.isPlaceholderData).toBe(true);

    await waitFor(() => expect(result.current.data).toEqual([second]));
    expect(result.current.isPlaceholderData).toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
