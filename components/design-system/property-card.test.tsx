import { describe, expect, test } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { PropertyCard } from "./property-card";
import type { Listing } from "@/lib/types";

const listing: Listing = {
  id: "1",
  title: "Cozy cabin",
  location: { city: "Aspen", country: "USA", lat: 39, lng: -106 },
  photos: ["https://example.com/p.jpg"],
  pricePerNight: 220,
  rating: 4.92,
  reviewCount: 88,
  isGuestFavorite: true,
  hostId: "h1",
  category: "Cabins",
};

describe("PropertyCard", () => {
  test("shows title, price and rating", () => {
    render(<PropertyCard listing={listing} />);
    expect(screen.getByText("Cozy cabin")).toBeInTheDocument();
    expect(screen.getByText(/\$220/)).toBeInTheDocument();
    expect(screen.getByText("4.92")).toBeInTheDocument();
  });

  test("shows the guest favorite badge when flagged", () => {
    render(<PropertyCard listing={listing} />);
    expect(screen.getByText("Guest favorite")).toBeInTheDocument();
  });

  test("heart toggles to the saved (rausch) state on click", async () => {
    render(<PropertyCard listing={listing} />);
    const heart = screen.getByRole("button", { name: /save/i });
    await userEvent.click(heart);
    expect(screen.getByRole("button", { name: /remove from wishlist/i })).toBeInTheDocument();
  });
});
