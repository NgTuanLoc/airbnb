import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { PropertyGrid } from "./property-grid";
import type { Listing } from "@/lib/types";

const listing: Listing = {
  id: "l1", title: "Cozy cabin", location: { city: "Aspen", country: "USA", lat: 39, lng: -106 },
  photos: ["https://example.com/p.jpg"], pricePerNight: 220, rating: 4.92, reviewCount: 88,
  isGuestFavorite: true, hostId: "h1", category: "Cabins",
};

describe("PropertyGrid", () => {
  test("renders a card per listing", () => {
    render(<PropertyGrid listings={[listing]} />);
    expect(screen.getByText("Cozy cabin")).toBeInTheDocument();
  });

  test("shows skeletons while loading", () => {
    const { container } = render(<PropertyGrid listings={[]} isLoading />);
    expect(container.querySelectorAll('[data-testid="property-skeleton"]').length).toBe(8);
  });

  test("shows an empty state when there are no listings and not loading", () => {
    render(<PropertyGrid listings={[]} />);
    expect(screen.getByText(/no places/i)).toBeInTheDocument();
  });
});
