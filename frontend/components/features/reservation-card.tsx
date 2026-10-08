"use client";

import Link from "next/link";
import { Button, buttonClassName } from "@/components/design-system";
import { BookingCalendar } from "./booking-calendar";
import { GuestStepper } from "./guest-stepper";
import { useReservationState, type ReservationState } from "@/lib/hooks/use-reservation-state";

export interface ReservationCardProps {
  pricePerNight: number;
  maxGuests: number;
  listingId: string;
  state?: ReservationState;
}

export function ReservationCard({ pricePerNight, maxGuests, listingId, state }: ReservationCardProps) {
  const own = useReservationState(listingId, pricePerNight, maxGuests);
  const s = state ?? own;

  return (
    <aside className="rounded-md border border-hairline bg-canvas p-6 shadow-airbnb">
      <p className="mb-4 text-display-md text-ink">
        ${pricePerNight} <span className="text-body-md text-muted">night</span>
      </p>

      <BookingCalendar
        month={s.month}
        checkIn={s.checkIn}
        checkOut={s.checkOut}
        blockedRanges={s.blockedRanges}
        onSelect={s.select}
        onMonthChange={s.setMonth}
      />

      <div className="mt-4 border-t border-hairline pt-2">
        <GuestStepper value={s.guests} onChange={s.setGuests} maxGuests={maxGuests} />
      </div>

      {s.bookHref ? (
        <Link href={s.bookHref} className={`${buttonClassName()} mt-4 w-full`}>
          Reserve
        </Link>
      ) : (
        <Button className="mt-4 w-full" disabled>
          Reserve
        </Button>
      )}
      <p className="mt-2 text-center text-body-sm text-muted">You won&apos;t be charged yet</p>

      {s.breakdown && (
        <dl className="mt-4 flex flex-col gap-2">
          {s.breakdown.lineItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-body-sm text-body">
              <dt>{item.label}</dt>
              <dd>${item.amount}</dd>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2 text-title-sm text-ink">
            <dt>Total</dt>
            <dd>${s.breakdown.total}</dd>
          </div>
        </dl>
      )}
    </aside>
  );
}
