"use client";

import { PropertyCard, Skeleton } from "@/components/design-system";
import { useWishlistHearts } from "@/components/features/wishlists/wishlist-hearts";
import type { Listing } from "@/lib/types";

export interface PropertyGridProps {
  listings: Listing[];
  isLoading?: boolean;
}

const gridClass = "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4";

function PropertySkeleton() {
  return (
    <div data-testid="property-skeleton" className="flex flex-col gap-2">
      <Skeleton radius="md" className="aspect-square w-full" />
      <Skeleton radius="xs" className="h-4 w-3/4" />
      <Skeleton radius="xs" className="h-4 w-1/2" />
    </div>
  );
}

export function PropertyGrid({ listings, isLoading }: PropertyGridProps) {
  const hearts = useWishlistHearts();

  if (isLoading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 8 }).map((_, i) => (
          <PropertySkeleton key={i} />
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
        <PropertyCard
          key={listing.id}
          listing={listing}
          saved={hearts?.savedIds.has(listing.id) ?? false}
          onToggleSave={hearts ? () => hearts.toggle(listing) : undefined}
        />
      ))}
    </div>
  );
}
