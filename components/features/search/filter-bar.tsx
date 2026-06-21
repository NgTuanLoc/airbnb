"use client";

import { CategoryStrip } from "../category-strip";

export interface FilterBarProps {
  categories: readonly string[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
}

export function FilterBar({
  categories,
  activeCategory,
  onCategoryChange,
  activeFilterCount,
  onOpenFilters,
}: FilterBarProps) {
  return (
    <div className="flex items-center gap-4 border-b border-hairline px-6">
      <div className="min-w-0 flex-1">
        <CategoryStrip categories={categories} active={activeCategory} onSelect={onCategoryChange} />
      </div>
      <button
        type="button"
        onClick={onOpenFilters}
        className="flex shrink-0 items-center gap-2 rounded-sm border border-hairline px-4 py-2 text-button-sm text-ink hover:border-ink"
      >
        Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
      </button>
    </div>
  );
}
