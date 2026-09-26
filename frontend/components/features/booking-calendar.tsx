"use client";

import { DatePickerDay } from "@/components/design-system";

export interface BookingCalendarProps {
  month: Date;
  checkIn: Date | null;
  checkOut: Date | null;
  minDate?: Date;
  onSelect: (date: Date) => void;
  onMonthChange: (next: Date) => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(a: Date | null, b: Date): boolean {
  return a !== null && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function BookingCalendar({ month, checkIn, checkOut, minDate, onSelect, onMonthChange }: BookingCalendarProps) {
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
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <span key={`pad-${i}`} aria-hidden className="h-10 w-10" />
        ))}
        {days.map((day) => {
          const date = new Date(year, monthIndex, day);
          const disabled = startOfDay(date).getTime() < floor.getTime();
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
