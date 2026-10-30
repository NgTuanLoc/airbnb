"use client";

import { DatePickerDay } from "@/components/design-system";
import { isNightBooked, isStayFree } from "@/lib/reservation/availability";
import { toIsoDate } from "@/lib/reservation/dates";
import type { Stay } from "@/lib/types";

export interface BookingCalendarProps {
  month: Date;
  checkIn: Date | null;
  checkOut: Date | null;
  minDate?: Date;
  blockedRanges?: Stay[];
  onSelect: (date: Date) => void;
  onMonthChange: (next: Date) => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
// The 1st falls under its weekday: one spacer fills the columns before it (by index: the 1st's weekday).
const LEADING_SPACER = ["", "col-span-1", "col-span-2", "col-span-3", "col-span-4", "col-span-5", "col-span-6"];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(a: Date | null, b: Date): boolean {
  return a !== null && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function BookingCalendar({ month, checkIn, checkOut, minDate, blockedRanges = [], onSelect, onMonthChange }: Readonly<BookingCalendarProps>) {
  const floor = startOfDay(minDate ?? new Date());
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthLabel = month.toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))} className="px-2 text-ink">
          ‹
        </button>
        <span className="text-title-sm text-ink">{monthLabel}</span>
        <button type="button" aria-label="Next month" onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))} className="px-2 text-ink">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="flex h-8 items-center justify-center text-caption-sm text-muted">
            {w}
          </span>
        ))}
        {firstWeekday > 0 && <span aria-hidden className={`h-10 ${LEADING_SPACER[firstWeekday]}`} />}
        {days.map((day) => {
          const date = new Date(year, monthIndex, day);
          const iso = toIsoDate(date);
          const choosingCheckOut = checkIn !== null && checkOut === null && date > checkIn;
          const bookedOut =
            isNightBooked(iso, blockedRanges) && !(choosingCheckOut && isStayFree(toIsoDate(checkIn), iso, blockedRanges));
          const disabled = startOfDay(date).getTime() < floor.getTime() || bookedOut;
          const selected = sameDay(checkIn, date) || sameDay(checkOut, date);
          const inRange =
            checkIn !== null &&
            checkOut !== null &&
            startOfDay(date).getTime() > startOfDay(checkIn).getTime() &&
            startOfDay(date).getTime() < startOfDay(checkOut).getTime();
          return (
            <DatePickerDay
              key={day}
              day={day}
              disabled={disabled}
              selected={selected}
              inRange={inRange}
              onSelect={() => onSelect(date)}
            />
          );
        })}
      </div>
    </div>
  );
}
