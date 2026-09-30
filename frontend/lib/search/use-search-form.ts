"use client";

import { useState } from "react";
import type { GuestCounts } from "@/components/features/guest-stepper";
import { toIsoDate } from "@/lib/reservation/dates";

const NO_GUESTS: GuestCounts = { adults: 0, children: 0 };

function formatShort(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The /s/... results URL for a search. Desktop and mobile search both build it here. */
export function buildSearchUrl(destination: string, guests: GuestCounts, checkIn: Date | null, checkOut: Date | null): string {
  const trimmed = destination.trim();
  const dest = trimmed ? encodeURIComponent(trimmed) : "anywhere";
  const params = new URLSearchParams();
  const total = guests.adults + guests.children;
  if (total > 0) params.set("guests", String(total));
  if (checkIn) params.set("checkIn", toIsoDate(checkIn));
  if (checkOut) params.set("checkOut", toIsoDate(checkOut));
  const qs = params.toString();
  return qs ? `/s/${dest}?${qs}` : `/s/${dest}`;
}

export interface SearchForm {
  destination: string;
  setDestination: (value: string) => void;
  checkIn: Date | null;
  checkOut: Date | null;
  guests: GuestCounts;
  setGuests: (value: GuestCounts) => void;
  selectDate: (date: Date) => void;
  clear: () => void;
  url: string;
  whenLabel: string;
  whoLabel: string;
}

export function useSearchForm(): SearchForm {
  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [guests, setGuests] = useState<GuestCounts>(NO_GUESTS);

  function selectDate(date: Date) {
    if (!checkIn || checkOut) {
      setCheckIn(date);
      setCheckOut(null);
    } else if (date > checkIn) {
      setCheckOut(date);
    } else {
      setCheckIn(date);
    }
  }

  function clear() {
    setDestination("");
    setCheckIn(null);
    setCheckOut(null);
    setGuests(NO_GUESTS);
  }

  const total = guests.adults + guests.children;
  const whenLabel =
    checkIn && checkOut ? `${formatShort(checkIn)} – ${formatShort(checkOut)}` : checkIn ? formatShort(checkIn) : "Add dates";
  const whoLabel = total > 0 ? `${total} ${total === 1 ? "guest" : "guests"}` : "Add guests";

  return {
    destination,
    setDestination,
    checkIn,
    checkOut,
    guests,
    setGuests,
    selectDate,
    clear,
    url: buildSearchUrl(destination, guests, checkIn, checkOut),
    whenLabel,
    whoLabel,
  };
}
