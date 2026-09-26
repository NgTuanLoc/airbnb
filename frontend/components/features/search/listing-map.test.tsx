import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("react-map-gl/maplibre", () => ({
  default: ({ children }: { children?: ReactNode }) => <div data-testid="map">{children}</div>,
  Marker: ({ children }: { children?: ReactNode }) => <div data-testid="marker">{children}</div>,
}));

import { ListingMap, MAP_STYLE } from "./listing-map";
import type { Listing } from "@/lib/types";

function make(id: string, price: number, lng: number, lat: number): Listing {
  return {
    id,
    title: `Listing ${id}`,
    location: { city: "Aspen", country: "USA", lat, lng },
    photos: ["/a.jpg"],
    pricePerNight: price,
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

describe("ListingMap", () => {
  test("renders a price marker for each listing", () => {
    render(<ListingMap listings={[make("l1", 220, -106.8, 39.1), make("l2", 540, -118.6, 34.0)]} />);
    expect(screen.getAllByTestId("marker")).toHaveLength(2);
    expect(screen.getByText("$220")).toBeInTheDocument();
    expect(screen.getByText("$540")).toBeInTheDocument();
  });

  test("uses the CARTO no-key basemap style", () => {
    expect(MAP_STYLE).toBe("https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json");
  });
});
