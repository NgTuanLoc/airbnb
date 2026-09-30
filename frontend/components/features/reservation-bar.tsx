"use client";

import Link from "next/link";
import { Button, buttonClassName } from "@/components/design-system";
import type { ReservationState } from "@/lib/hooks/use-reservation-state";

const short = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function ReservationBar({ pricePerNight, state }: { pricePerNight: number; state: ReservationState }) {
  function checkAvailability() {
    const card = document.getElementById("reserve");
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    card?.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    card?.querySelector<HTMLButtonElement>("[data-calendar-day]:not(:disabled)")?.focus();
  }

  const dates = state.checkIn && state.checkOut ? `${short(state.checkIn)} – ${short(state.checkOut)}` : "Add dates for prices";

  return (
    <section
      aria-label="Reservation summary"
      className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between border-t border-hairline bg-canvas px-6 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:hidden"
    >
      <div>
        <p className="text-title-sm text-ink">
          ${pricePerNight} <span className="text-body-sm text-muted">night</span>
        </p>
        <p className="text-body-sm text-muted">{dates}</p>
      </div>
      {state.bookHref ? (
        <Link href={state.bookHref} className={buttonClassName()}>Reserve</Link>
      ) : (
        <Button type="button" onClick={checkAvailability}>Check availability</Button>
      )}
    </section>
  );
}
