import { PropertyCard } from "@/components/design-system";
import type { Listing } from "@/lib/types";

export interface PropertyGridProps {
  listings: Listing[];
  isLoading?: boolean;
}

const gridClass = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4";

function Skeleton() {
  return (
    <div data-testid="property-skeleton" className="flex flex-col gap-2">
      <div className="aspect-square w-full animate-pulse rounded-md bg-surface-strong" />
      <div className="h-4 w-3/4 animate-pulse rounded-xs bg-surface-strong" />
      <div className="h-4 w-1/2 animate-pulse rounded-xs bg-surface-strong" />
    </div>
  );
}

export function PropertyGrid({ listings, isLoading }: PropertyGridProps) {
  if (isLoading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  }

  if (listings.length === 0) {
    return <p className="text-body-md text-muted">No places match this category yet.</p>;
  }

  return (
    <div className={gridClass}>
      {listings.map((listing) => (
        <PropertyCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
