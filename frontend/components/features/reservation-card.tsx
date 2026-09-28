"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonClassName } from "@/components/design-system";
import { BookingCalendar } from "./booking-calendar";
import { GuestStepper, type GuestCounts } from "./guest-stepper";
import { nightsBetween, calculatePriceBreakdown } from "@/lib/reservation/pricing";
import { toIsoDate } from "@/lib/reservation/dates";

export interface ReservationCardProps {
  pricePerNight: number;
  maxGuests: number;
  listingId: string;
}

function startOfThisMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function ReservationCard({ pricePerNight, maxGuests, listingId }: ReservationCardProps) {
  const [month, setMonth] = useState<Date>(startOfThisMonth);
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [guests, setGuests] = useState<GuestCounts>({ adults: 1, children: 0 });

  function handleSelect(date: Date) {
    if (checkIn === null || checkOut !== null || date.getTime() <= checkIn.getTime()) {
      setCheckIn(date);
      setCheckOut(null);
      return;
    }
    setCheckOut(date);
  }

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const breakdown = nights > 0 ? calculatePriceBreakdown(pricePerNight, nights) : null;

  return (
    <aside className="rounded-md border border-hairline bg-canvas p-6 shadow-airbnb">
      <p className="mb-4 text-display-md text-ink">
        ${pricePerNight} <span className="text-body-md text-muted">night</span>
      </p>

      <BookingCalendar
        month={month}
        checkIn={checkIn}
        checkOut={checkOut}
        onSelect={handleSelect}
        onMonthChange={setMonth}
      />

      <div className="mt-4 border-t border-hairline pt-2">
        <GuestStepper value={guests} onChange={setGuests} maxGuests={maxGuests} />
      </div>

      {breakdown && checkIn && checkOut ? (
        <Link
          href={`/book/${listingId}?${new URLSearchParams({
            checkIn: toIsoDate(checkIn),
            checkOut: toIsoDate(checkOut),
            adults: String(guests.adults),
            children: String(guests.children),
          })}`}
          className={`${buttonClassName()} mt-4 w-full`}
        >
          Reserve
        </Link>
      ) : (
        <Button className="mt-4 w-full" disabled>
          Reserve
        </Button>
      )}
      <p className="mt-2 text-center text-body-sm text-muted">You won&apos;t be charged yet</p>

      {breakdown && (
        <dl className="mt-4 flex flex-col gap-2">
          {breakdown.lineItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-body-sm text-body">
              <dt>{item.label}</dt>
              <dd>${item.amount}</dd>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2 text-title-sm text-ink">
            <dt>Total</dt>
            <dd>${breakdown.total}</dd>
          </div>
        </dl>
      )}
    </aside>
  );
}
