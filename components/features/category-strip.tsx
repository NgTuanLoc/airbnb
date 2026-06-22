"use client";

import { cn } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/icons";

export interface CategoryStripProps {
  categories: readonly string[];
  active: string;
  onSelect: (category: string) => void;
}

export function CategoryStrip({ categories, active, onSelect }: CategoryStripProps) {
  return (
    <div className="flex gap-8 overflow-x-auto border-b border-hairline py-4">
      {categories.map((category) => {
        const Icon = getCategoryIcon(category);
        return (
          <button
            key={category}
            type="button"
            onClick={() => onSelect(category)}
            className={cn(
              "flex flex-col items-center gap-2 whitespace-nowrap border-b-2 border-transparent pb-3 text-button-sm",
              category === active ? "border-ink text-ink" : "text-muted hover:text-ink",
            )}
          >
            <Icon aria-hidden className="size-6" />
            {category}
          </button>
        );
      })}
    </div>
  );
}
