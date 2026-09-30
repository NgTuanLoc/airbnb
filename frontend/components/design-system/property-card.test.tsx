import { describe, expect, test, vi } from "vitest";
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

  test("shows no heart without a save handler", () => {
    render(<PropertyCard listing={listing} />);
    expect(screen.queryByRole("button", { name: /wishlist/i })).not.toBeInTheDocument();
  });

  test("the heart calls onToggleSave", async () => {
    const onToggleSave = vi.fn();
    render(<PropertyCard listing={listing} saved={false} onToggleSave={onToggleSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Save to wishlist" }));
    expect(onToggleSave).toHaveBeenCalledOnce();
  });

  test("a saved listing shows the filled rausch heart", () => {
    render(<PropertyCard listing={listing} saved onToggleSave={() => {}} />);
    const heart = screen.getByRole("button", { name: "Remove from wishlist" });
    expect(heart.querySelector("svg")).toHaveAttribute("fill", "var(--color-rausch)");
  });

  test("the photo zooms on hover without resizing the card", () => {
    render(<PropertyCard listing={listing} />);
    const img = screen.getByRole("img", { name: listing.title });
    expect(img.className).toContain("group-hover:scale-105");
    expect(img.className).toContain("transition-transform");
  });

  test("a listing without reviews shows New instead of a rating", () => {
    render(<PropertyCard listing={{ ...listing, rating: 0, reviewCount: 0 }} />);
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.queryByText("0.00")).not.toBeInTheDocument();
  });

  test("renders a placeholder instead of crashing when a listing has no photos", () => {
    render(<PropertyCard listing={{ ...listing, photos: [] }} />);
    expect(screen.getByTestId("photo-placeholder").className).toContain("bg-surface-strong");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
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
