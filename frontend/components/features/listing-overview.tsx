import type { Listing } from "@/lib/types";
import { Users, DoorOpen, Bed, Bath } from "lucide-react";

export interface ListingOverviewProps {
  listing: Listing;
}

export function ListingOverview({ listing }: ListingOverviewProps) {
  const stats = [
    { icon: Users, label: `${listing.maxGuests} guests` },
    { icon: DoorOpen, label: `${listing.bedrooms} bedroom${listing.bedrooms === 1 ? "" : "s"}` },
    { icon: Bed, label: `${listing.beds} bed${listing.beds === 1 ? "" : "s"}` },
    { icon: Bath, label: `${listing.baths} bath${listing.baths === 1 ? "" : "s"}` },
  ];

  return (
    <header className="flex flex-col gap-2 py-6">
      <h1 className="text-display-xl text-ink">{listing.title}</h1>
      <p className="text-body-md text-ink">{listing.propertyType}</p>
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <li key={stat.label} className="flex items-center gap-2 text-body-md text-ink">
              <Icon aria-hidden className="size-5" />
              {stat.label}
            </li>
          );
        })}
      </ul>
      <p className="text-body-sm text-ink">
        <span aria-hidden>★ </span>
        {listing.reviewCount === 0 ? "New" : `${listing.rating.toFixed(2)} · ${listing.reviewCount} reviews`} ·{" "}
        <span className="text-muted">{listing.location.city}, {listing.location.country}</span>
      </p>
    </header>
  );
}
