"use client";

import { cn } from "@/lib/utils";

export interface CategoryStripProps {
  categories: readonly string[];
  active: string;
  onSelect: (category: string) => void;
}

export function CategoryStrip({ categories, active, onSelect }: CategoryStripProps) {
  return (
    <div className="flex gap-8 overflow-x-auto border-b border-hairline py-4">
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => onSelect(category)}
          className={cn(
            "whitespace-nowrap border-b-2 border-transparent pb-3 text-button-sm",
            category === active ? "border-ink text-ink" : "text-muted hover:text-ink",
          )}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
