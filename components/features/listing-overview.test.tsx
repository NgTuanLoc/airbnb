import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListingOverview } from "./listing-overview";
import type { Listing } from "@/lib/types";

const listing: Listing = {
  id: "l1", title: "Cozy cabin in the pines",
  location: { city: "Aspen", country: "USA", lat: 39.19, lng: -106.82 },
  photos: ["/a.jpg"], pricePerNight: 220, rating: 4.92, reviewCount: 88,
  isGuestFavorite: true, hostId: "h1", category: "Cabins",
  description: "Warm cabin.", propertyType: "Entire cabin",
  maxGuests: 4, bedrooms: 2, beds: 3, baths: 1, amenities: ["Wifi"],
};

describe("ListingOverview", () => {
  test("renders the title as a heading", () => {
    render(<ListingOverview listing={listing} />);
    expect(screen.getByRole("heading", { level: 1, name: /cozy cabin in the pines/i })).toBeInTheDocument();
  });

  test("shows the specs line and rating summary", () => {
    render(<ListingOverview listing={listing} />);
    expect(screen.getByText(/entire cabin/i)).toBeInTheDocument();
    expect(screen.getByText(/4 guests/i)).toBeInTheDocument();
    expect(screen.getByText(/88 reviews/i)).toBeInTheDocument();
    expect(screen.getByText(/aspen, usa/i)).toBeInTheDocument();
  });
});
