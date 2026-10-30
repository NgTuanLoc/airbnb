"use client";

import { setWorkerUrl } from "maplibre-gl";
import Map, { Marker } from "react-map-gl/maplibre";
import type { Listing } from "@/lib/types";
import { PriceMarker } from "./price-marker";

export const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

// maplibre-gl 6 looks for its worker beside its own module, which a bundled chunk isn't, and without one the map
// can't load tiles. Next emits the worker as an asset: point maplibre at it (MapLibre's documented Next.js setup).
// This module only runs in the browser (it's loaded with ssr: false), before the first map is made.
setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());

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

export function ListingMap({ listings, selectedId, onSelect }: Readonly<ListingMapProps>) {
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
