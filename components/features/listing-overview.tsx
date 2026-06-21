import type { Listing } from "@/lib/types";

export interface ListingOverviewProps {
  listing: Listing;
}

export function ListingOverview({ listing }: ListingOverviewProps) {
  const specs = [
    listing.propertyType,
    `${listing.maxGuests} guests`,
    `${listing.bedrooms} bedroom${listing.bedrooms === 1 ? "" : "s"}`,
    `${listing.beds} bed${listing.beds === 1 ? "" : "s"}`,
    `${listing.baths} bath${listing.baths === 1 ? "" : "s"}`,
  ].join(" · ");

  return (
    <header className="flex flex-col gap-1 py-6">
      <h1 className="text-display-xl text-ink">{listing.title}</h1>
      <p className="text-body-md text-ink">{specs}</p>
      <p className="text-body-sm text-ink">
        <span aria-hidden>★ </span>
        {listing.rating.toFixed(2)} · {listing.reviewCount} reviews ·{" "}
        <span className="text-muted">{listing.location.city}, {listing.location.country}</span>
      </p>
    </header>
  );
}
