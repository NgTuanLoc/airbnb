"use client";

import type { City } from "@/lib/types";

export interface DestinationPanelProps {
  value: string;
  suggestions: City[];
  onChange: (value: string) => void;
  onSelect: (cityName: string) => void;
}

export function DestinationPanel({ value, suggestions, onChange, onSelect }: DestinationPanelProps) {
  const query = value.trim().toLowerCase();
  const filtered = query ? suggestions.filter((city) => city.name.toLowerCase().includes(query)) : suggestions;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-caption text-ink">
        Where to?
        <input
          type="text"
          aria-label="Where to?"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search destinations"
          className="rounded-sm border border-hairline bg-canvas px-4 py-3 text-body-md text-ink"
        />
      </label>
      <ul className="flex flex-col">
        {filtered.map((city) => (
          <li key={city.id}>
            <button
              type="button"
              onClick={() => onSelect(city.name)}
              aria-label={city.name}
              className="flex w-full flex-col rounded-sm px-3 py-2 text-left hover:bg-surface-soft"
            >
              <span className="text-body-md text-ink">{city.name}</span>
              <span className="text-body-sm text-muted">{city.subLabel}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
