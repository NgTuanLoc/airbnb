"use client";

import { cn } from "@/lib/utils";

export interface GuestCounts {
  adults: number;
  children: number;
}

export interface GuestStepperProps {
  value: GuestCounts;
  onChange: (next: GuestCounts) => void;
  maxGuests: number;
}

const circleButton =
  "flex h-8 w-8 items-center justify-center rounded-full border border-border-strong text-ink disabled:cursor-not-allowed disabled:opacity-40";

function Row({
  label,
  count,
  onDecrease,
  onIncrease,
  canDecrease,
  canIncrease,
}: {
  label: string;
  count: number;
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease: boolean;
  canIncrease: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-body-md text-ink">{label}</span>
      <span className="flex items-center gap-4">
        <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={!canDecrease} onClick={onDecrease} className={circleButton}>
          −
        </button>
        <span className="w-6 text-center text-body-md text-ink">{count}</span>
        <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={!canIncrease} onClick={onIncrease} className={cn(circleButton)}>
          +
        </button>
      </span>
    </div>
  );
}

export function GuestStepper({ value, onChange, maxGuests }: GuestStepperProps) {
  const total = value.adults + value.children;
  const canAddMore = total < maxGuests;
  return (
    <div className="flex flex-col">
      <Row
        label="Adults"
        count={value.adults}
        canDecrease={value.adults > 1}
        canIncrease={canAddMore}
        onDecrease={() => onChange({ ...value, adults: value.adults - 1 })}
        onIncrease={() => onChange({ ...value, adults: value.adults + 1 })}
      />
      <Row
        label="Children"
        count={value.children}
        canDecrease={value.children > 0}
        canIncrease={canAddMore}
        onDecrease={() => onChange({ ...value, children: value.children - 1 })}
        onIncrease={() => onChange({ ...value, children: value.children + 1 })}
      />
    </div>
  );
}
