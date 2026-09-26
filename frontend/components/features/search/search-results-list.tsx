import { PropertyCard, Skeleton } from "@/components/design-system";
import type { Listing } from "@/lib/types";

export interface SearchResultsListProps {
  listings: Listing[];
  isLoading?: boolean;
  location: string;
}

const gridClass = "grid grid-cols-1 gap-6 sm:grid-cols-2";

function placeLabel(location: string): string {
  return location && location.toLowerCase() !== "anywhere" ? location : "your search";
}

function ResultSkeleton() {
  return (
    <div data-testid="result-skeleton" className="flex flex-col gap-2">
      <Skeleton radius="md" className="aspect-square w-full" />
      <Skeleton radius="xs" className="h-4 w-3/4" />
    </div>
  );
}

export function SearchResultsList({ listings, isLoading, location }: SearchResultsListProps) {
  const place = placeLabel(location);

  if (isLoading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 6 }).map((_, i) => (
          <ResultSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (listings.length === 0) {
    return <p className="text-body-md text-muted">No stays found for {place}. Try adjusting your filters.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title-md text-ink">
        {listings.length} stays in {place}
      </h1>
      <div className={gridClass}>
        {listings.map((listing) => (
          <PropertyCard key={listing.id} listing={listing} />
        ))}
      </div>
    </div>
  );
}
