import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/s/Aspen",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("./listing-map", () => ({
  ListingMap: () => <div data-testid="listing-map" />,
}));

const useSearchListings = vi.fn();
vi.mock("@/lib/hooks/use-search-listings", () => ({
  useSearchListings: (filters: unknown) => useSearchListings(filters),
}));

import { SearchResults } from "./search-results";
import type { Listing } from "@/lib/types";

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

describe("SearchResults", () => {
  test("renders the results list and map for the location", async () => {
    useSearchListings.mockReturnValue({ data: [make("l1")], isLoading: false, isError: false });
    render(<SearchResults location="Aspen" />);
    expect(screen.getByRole("heading", { name: /1 stays in aspen/i })).toBeInTheDocument();
    // ListingMap is loaded via next/dynamic (ssr:false), so it mounts after the dynamic import resolves.
    expect(await screen.findByTestId("listing-map")).toBeInTheDocument();
  });

  test("selecting a category pushes the category to the URL", async () => {
    useSearchListings.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<SearchResults location="Aspen" />);
    await userEvent.click(screen.getByRole("button", { name: "Cabins" }));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("category=Cabins"));
  });

  test("shows an error state when the query fails", () => {
    useSearchListings.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<SearchResults location="Aspen" />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
