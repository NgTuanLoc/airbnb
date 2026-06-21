import { describe, expect, test } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSearchListings } from "./use-search-listings";
import type { Listing } from "@/lib/types";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function make(id: string): Listing {
  return {
    id,
    title: `Listing ${id}`,
    location: { city: "Aspen", country: "USA", lat: 39.1, lng: -106.8 },
    photos: ["/a.jpg"],
    pricePerNight: 220,
    rating: 4.9,
    reviewCount: 10,
    isGuestFavorite: false,
    hostId: "h1",
    category: "Cabins",
    description: "x",
    propertyType: "Entire cabin",
    maxGuests: 4,
    bedrooms: 2,
    beds: 2,
    baths: 1,
    amenities: ["Wifi"],
  };
}

describe("useSearchListings", () => {
  test("fetches listings for the given filters", async () => {
    const listings = [make("l1")];
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, data: listings }), {
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    try {
      const { result } = renderHook(() => useSearchListings({ location: "Aspen", minPrice: 200 }), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.[0]?.id).toBe("l1");
    } finally {
      globalThis.fetch = original;
    }
  });
});
