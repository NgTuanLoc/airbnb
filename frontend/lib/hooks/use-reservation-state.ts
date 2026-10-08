"use client";

import { useState } from "react";
import type { GuestCounts } from "@/components/features/guest-stepper";
import { useListingAvailability } from "@/lib/hooks/use-listing-availability";
import { isStayFree } from "@/lib/reservation/availability";
import { toIsoDate } from "@/lib/reservation/dates";
import { calculatePriceBreakdown, nightsBetween } from "@/lib/reservation/pricing";
import type { ReservationInit } from "@/lib/reservation/query";
import type { Stay } from "@/lib/types";

export interface ReservationState {
  month: Date;
  setMonth: (month: Date) => void;
  checkIn: Date | null;
  checkOut: Date | null;
  guests: GuestCounts;
  setGuests: (guests: GuestCounts) => void;
  select: (date: Date) => void;
  blockedRanges: Stay[];
  breakdown: ReturnType<typeof calculatePriceBreakdown> | null;
  bookHref: string | null;
}

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

/** The dates and guests a reservation is being built from, shared by the card and the mobile bar. */
export function useReservationState(listingId: string, pricePerNight: number, maxGuests: number, init?: ReservationInit): ReservationState {
  const initialGuests =
    init && init.adults + init.children <= maxGuests ? { adults: init.adults, children: init.children } : { adults: 1, children: 0 };
  const [month, setMonth] = useState<Date>(() => startOfMonth(init?.checkIn ?? new Date()));
  const [checkIn, setCheckIn] = useState<Date | null>(init?.checkIn ?? null);
  const [checkOut, setCheckOut] = useState<Date | null>(init?.checkOut ?? null);
  const [guests, setGuests] = useState<GuestCounts>(initialGuests);
  const blockedRanges = useListingAvailability(listingId);

  function select(date: Date) {
    // The calendar greys out such days, but query-param dates and races can still reach here.
    const spansBookedNights = checkIn !== null && !isStayFree(toIsoDate(checkIn), toIsoDate(date), blockedRanges);
    if (checkIn === null || checkOut !== null || date.getTime() <= checkIn.getTime() || spansBookedNights) {
      setCheckIn(date);
      setCheckOut(null);
      return;
    }
    setCheckOut(date);
  }

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const breakdown = nights > 0 ? calculatePriceBreakdown(pricePerNight, nights) : null;
  const bookHref =
    breakdown && checkIn && checkOut
      ? `/book/${listingId}?${new URLSearchParams({
          checkIn: toIsoDate(checkIn),
          checkOut: toIsoDate(checkOut),
          adults: String(guests.adults),
          children: String(guests.children),
        })}`
      : null;

  return { month, setMonth, checkIn, checkOut, guests, setGuests, select, blockedRanges, breakdown, bookHref };
}
