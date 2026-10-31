"use client";

import Map, { Marker, NavigationControl } from "react-map-gl/maplibre";
import { House } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
// Its module also points maplibre at its worker (see listing-map.tsx).
import { MAP_STYLE } from "@/components/features/search/listing-map";

export interface RoomMapProps {
  latitude: number;
  longitude: number;
  label: string;
}

/** The place on a map, marked the way Airbnb marks a home. The wheel scrolls the page, not the map: zoom with the buttons. */
export function RoomMapCanvas({ latitude, longitude, label }: Readonly<RoomMapProps>) {
  return (
    <Map
      initialViewState={{ longitude, latitude, zoom: 12 }}
      mapStyle={MAP_STYLE}
      scrollZoom={false}
      style={{ width: "100%", height: "100%" }}
    >
      <NavigationControl position="top-right" showCompass={false} />
      <Marker longitude={longitude} latitude={latitude}>
        <span role="img" aria-label={label} className="flex size-16 items-center justify-center rounded-full bg-rausch/20">
          <span className="flex size-11 items-center justify-center rounded-full bg-rausch text-on-primary shadow-airbnb">
            <House aria-hidden className="size-5" />
          </span>
        </span>
      </Marker>
    </Map>
  );
}
