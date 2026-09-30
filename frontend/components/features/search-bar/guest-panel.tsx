"use client";

import { GuestStepper, type GuestCounts } from "@/components/features/guest-stepper";

export const MAX_GUESTS = 16;

export interface GuestPanelProps {
  value: GuestCounts;
  onChange: (next: GuestCounts) => void;
}

export function GuestPanel({ value, onChange }: GuestPanelProps) {
  return (
    <div className="w-full max-w-[320px]">
      <GuestStepper value={value} onChange={onChange} maxGuests={MAX_GUESTS} />
    </div>
  );
}
