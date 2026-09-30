"use client";

import { useState } from "react";
import { useReservationState } from "@/lib/hooks/use-reservation-state";
import { fromReservationInitDto, type ReservationInitDto } from "@/lib/reservation/query";
import { ReservationBar } from "./reservation-bar";
import { ReservationCard } from "./reservation-card";

export interface ReservationPanelProps {
  listingId: string;
  pricePerNight: number;
  maxGuests: number;
  initial: ReservationInitDto;
}

/** The reservation card (rail from md up, in flow on mobile) plus the mobile sticky bar, over one shared state. */
export function ReservationPanel({ listingId, pricePerNight, maxGuests, initial }: ReservationPanelProps) {
  const [init] = useState(() => fromReservationInitDto(initial));
  const state = useReservationState(listingId, pricePerNight, maxGuests, init);
  return (
    <>
      <div id="reserve" className="scroll-mt-24">
        <ReservationCard listingId={listingId} pricePerNight={pricePerNight} maxGuests={maxGuests} state={state} />
      </div>
      <ReservationBar pricePerNight={pricePerNight} state={state} />
    </>
  );
}
