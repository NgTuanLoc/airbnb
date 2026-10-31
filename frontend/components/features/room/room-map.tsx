"use client";

import dynamic from "next/dynamic";
import type { RoomMapProps } from "./room-map-canvas";

// maplibre runs only in the browser.
const RoomMapCanvas = dynamic(() => import("./room-map-canvas").then((m) => m.RoomMapCanvas), {
  ssr: false,
  loading: () => <div className="size-full bg-surface-strong" />,
});

export function RoomMap(props: Readonly<RoomMapProps>) {
  return <RoomMapCanvas {...props} />;
}
