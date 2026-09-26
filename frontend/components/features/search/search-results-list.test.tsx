import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { SearchResultsList } from "./search-results-list";
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

describe("SearchResultsList", () => {
  test("shows a count heading and one card per listing", () => {
    render(<SearchResultsList listings={[make("l1"), make("l2")]} location="Aspen" />);
    expect(screen.getByRole("heading", { name: /2 stays in aspen/i })).toBeInTheDocument();
    expect(screen.getByText("Listing l1")).toBeInTheDocument();
  });

  test("renders skeletons while loading", () => {
    render(<SearchResultsList listings={[]} isLoading location="Aspen" />);
    expect(screen.getAllByTestId("result-skeleton").length).toBeGreaterThan(0);
  });

  test("renders an empty state when there are no results", () => {
    render(<SearchResultsList listings={[]} location="Aspen" />);
    expect(screen.getByText(/no stays found/i)).toBeInTheDocument();
  });
});
