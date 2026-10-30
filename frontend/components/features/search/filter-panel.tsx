"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/design-system";

export interface FilterValues {
  minPrice?: number;
  maxPrice?: number;
  guests?: number;
  bedrooms?: number;
  beds?: number;
  baths?: number;
}

export interface FilterPanelProps {
  initial: FilterValues;
  onApply: (values: FilterValues) => void;
  onClose: () => void;
}

const ROOM_FIELDS: { key: "guests" | "bedrooms" | "beds" | "baths"; label: string }[] = [
  { key: "guests", label: "Guests" },
  { key: "bedrooms", label: "Bedrooms" },
  { key: "beds", label: "Beds" },
  { key: "baths", label: "Bathrooms" },
];

function toNumberOrUndefined(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const stepButton =
  "flex h-8 w-8 items-center justify-center rounded-full border border-border-strong text-ink disabled:cursor-not-allowed disabled:opacity-40";

export function FilterPanel({ initial, onApply, onClose }: Readonly<FilterPanelProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<FilterValues>(initial);

  // A native modal: focus trap, Esc and a backdrop. It unmounts on close, so focus goes back by hand to its opener.
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  // A tap on the backdrop (the dialog element itself, around its content) closes it.
  function handleDialogClick(event: React.MouseEvent) {
    if (event.target === dialogRef.current) onClose();
  }

  function setField(key: keyof FilterValues, value: number | undefined) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    <dialog // NOSONAR: light dismiss on the backdrop; the keyboard closes it with Esc
      ref={dialogRef}
      aria-label="Filters"
      onClose={onClose}
      onClick={handleDialogClick}
      className="m-auto w-[480px] rounded-lg bg-canvas p-0 shadow-airbnb backdrop:bg-scrim/50"
    >
      <div className="p-6">
        <h2 className="mb-4 text-display-sm text-ink">Filters</h2>

        <section className="border-b border-hairline pb-4">
          <h3 className="mb-2 text-title-sm text-ink">Price range</h3>
          <div className="flex items-center gap-3">
            <label className="flex flex-1 flex-col text-caption text-muted">
              <span>Min</span>
              <input
                type="number"
                inputMode="numeric"
                aria-label="Minimum price"
                value={draft.minPrice ?? ""}
                onChange={(e) => setField("minPrice", toNumberOrUndefined(e.target.value))}
                className="h-12 rounded-sm border border-hairline px-3 text-body-md text-ink"
              />
            </label>
            <label className="flex flex-1 flex-col text-caption text-muted">
              <span>Max</span>
              <input
                type="number"
                inputMode="numeric"
                aria-label="Maximum price"
                value={draft.maxPrice ?? ""}
                onChange={(e) => setField("maxPrice", toNumberOrUndefined(e.target.value))}
                className="h-12 rounded-sm border border-hairline px-3 text-body-md text-ink"
              />
            </label>
          </div>
        </section>

        {ROOM_FIELDS.map(({ key, label }) => {
          const value = draft[key] ?? 0;
          return (
            <div key={key} className="flex items-center justify-between border-b border-hairline py-3">
              <span className="text-body-md text-ink">{label}</span>
              <span className="flex items-center gap-4">
                <button
                  type="button"
                  aria-label={`Decrease ${label.toLowerCase()}`}
                  disabled={value <= 0}
                  onClick={() => setField(key, value <= 1 ? undefined : value - 1)}
                  className={stepButton}
                >
                  −
                </button>
                <span className="w-12 text-center text-body-md text-ink">{value === 0 ? "Any" : `${value}+`}</span>
                <button
                  type="button"
                  aria-label={`Increase ${label.toLowerCase()}`}
                  onClick={() => setField(key, value + 1)}
                  className={stepButton}
                >
                  +
                </button>
              </span>
            </div>
          );
        })}

        <div className="mt-6 flex items-center justify-between">
          <button type="button" onClick={() => setDraft({})} className="text-button-md text-ink underline">
            Clear all
          </button>
          <Button onClick={() => onApply(draft)}>Show results</Button>
        </div>
      </div>
    </dialog>
  );
}
