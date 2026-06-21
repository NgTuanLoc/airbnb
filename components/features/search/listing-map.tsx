"use client";

import Map, { Marker } from "react-map-gl/maplibre";
import type { Listing } from "@/lib/types";
import { PriceMarker } from "./price-marker";

const MAP_STYLE = "https://demotiles.maplibre.org/style.json";

export interface ListingMapProps {
  listings: Listing[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

function initialView(listings: Listing[]) {
  const first = listings[0];
  return {
    longitude: first ? first.location.lng : -98.5,
    latitude: first ? first.location.lat : 39.8,
    zoom: first ? 9 : 3,
  };
}

export function ListingMap({ listings, selectedId, onSelect }: ListingMapProps) {
  return (
    <Map initialViewState={initialView(listings)} mapStyle={MAP_STYLE} style={{ width: "100%", height: "100%" }}>
      {listings.map((listing) => (
        <Marker key={listing.id} longitude={listing.location.lng} latitude={listing.location.lat} anchor="bottom">
          <PriceMarker
            price={listing.pricePerNight}
            selected={listing.id === selectedId}
            onClick={() => onSelect?.(listing.id)}
          />
        </Marker>
      ))}
    </Map>
  );
}
