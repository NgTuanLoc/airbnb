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

export function DatePanel({ checkIn, checkOut, onSelect }: DatePanelProps) {
  const [month, setMonth] = useState<Date>(() => startOfMonth(checkIn ?? new Date()));

  return (
    <div className="w-full max-w-[320px]">
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
