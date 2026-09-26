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
  description: "A cozy cabin in the mountains.",
  propertyType: "Entire cabin",
  maxGuests: 4,
  bedrooms: 2,
  beds: 2,
  baths: 1,
  amenities: ["Wifi", "Kitchen"],
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

  test("the photo zooms on hover without resizing the card", () => {
    render(<PropertyCard listing={listing} />);
    const img = screen.getByRole("img", { name: listing.title });
    expect(img.className).toContain("group-hover:scale-105");
    expect(img.className).toContain("transition-transform");
  });
});

test("links to the listing detail page", () => {
  const listing: Listing = {
    id: "l1", title: "Cozy cabin", location: { city: "Aspen", country: "USA", lat: 0, lng: 0 },
    photos: ["/a.jpg"], pricePerNight: 220, rating: 4.92, reviewCount: 88,
    isGuestFavorite: false, hostId: "h1", category: "Cabins",
    description: "x", propertyType: "Entire cabin", maxGuests: 2, bedrooms: 1, beds: 1, baths: 1, amenities: ["Wifi"],
  };
  render(<PropertyCard listing={listing} />);
  expect(screen.getByRole("link", { name: /cozy cabin/i })).toHaveAttribute("href", "/rooms/l1");
});
