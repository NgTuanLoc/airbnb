"use client";

import { useState } from "react";
import { BookingCalendar } from "@/components/features/booking-calendar";

export interface DatePanelProps {
  checkIn: Date | null;
  checkOut: Date | null;
  onSelect: (date: Date) => void;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function DatePanel({ checkIn, checkOut, onSelect }: Readonly<DatePanelProps>) {
  const [month, setMonth] = useState<Date>(() => startOfMonth(checkIn ?? new Date()));

  return (
    // A width of its own: the pop-up around it shrinks to fit, and the day buttons are percentages of this, so without
    // one the calendar's size would hang on the month shown.
    <div className="w-80 max-w-full">
      <BookingCalendar
        month={month}
        checkIn={checkIn}
        checkOut={checkOut}
        minDate={new Date()}
        onSelect={onSelect}
        onMonthChange={setMonth}
      />
    </div>
  );
}
