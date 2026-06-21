"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/lib/types";
import { useSearchListings } from "@/lib/hooks/use-search-listings";
import { filtersFromSearch, countActiveFilters } from "@/lib/search/filters";
import { FilterBar } from "./filter-bar";
import { FilterPanel, type FilterValues } from "./filter-panel";
import { SearchResultsList } from "./search-results-list";

const ListingMap = dynamic(() => import("./listing-map").then((m) => m.ListingMap), { ssr: false });

const MODAL_KEYS = ["minPrice", "maxPrice", "guests", "bedrooms", "beds", "baths"] as const;

export interface SearchResultsProps {
  location: string;
}

export function SearchResults({ location }: SearchResultsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filters = filtersFromSearch(location, new URLSearchParams(searchParams.toString()));
  const { data, isLoading, isError } = useSearchListings(filters);
  const listings = data ?? [];

  function pushParams(mutate: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams.toString());
    mutate(next);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleCategory(category: string) {
    pushParams((params) => {
      if (!category || category === "All") params.delete("category");
      else params.set("category", category);
    });
  }

  function handleApply(values: FilterValues) {
    pushParams((params) => {
      for (const key of MODAL_KEYS) {
        const value = values[key];
        if (value === undefined) params.delete(key);
        else params.set(key, String(value));
      }
    });
    setPanelOpen(false);
  }

  return (
    <div className="flex flex-1 flex-col">
      <FilterBar
        categories={CATEGORIES}
        activeCategory={filters.category ?? "All"}
        onCategoryChange={handleCategory}
        activeFilterCount={countActiveFilters(filters)}
        onOpenFilters={() => setPanelOpen(true)}
      />

      <div className="flex flex-1">
        <div className="w-full px-6 py-6 lg:w-[62%]">
          {isError ? (
            <p className="text-body-md text-error">Something went wrong loading stays. Please try again.</p>
          ) : (
            <SearchResultsList listings={listings} isLoading={isLoading} location={location} />
          )}
        </div>
        <div
          data-testid="map-panel"
          className="hidden lg:sticky lg:top-20 lg:block lg:h-[calc(100vh-5rem)] lg:w-[38%]"
        >
          <ListingMap listings={listings} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>

      {panelOpen && (
        <FilterPanel
          initial={{
            minPrice: filters.minPrice,
            maxPrice: filters.maxPrice,
            guests: filters.guests,
            bedrooms: filters.bedrooms,
            beds: filters.beds,
            baths: filters.baths,
          }}
          onApply={handleApply}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}
