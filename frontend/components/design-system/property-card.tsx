"use client";

import Image from "next/image";
import Link from "next/link";
import type { Listing } from "@/lib/types";
import { GuestFavoriteBadge } from "./badges";

export function PropertyCard({
  listing,
  saved = false,
  onToggleSave,
}: {
  listing: Listing;
  saved?: boolean;
  onToggleSave?: () => void;
}) {
  return (
    <article className="group relative flex flex-col gap-2">
      <Link href={`/rooms/${listing.id}`} className="flex flex-col gap-2">
        <div className="relative aspect-square w-full overflow-hidden rounded-md">
          <Image
            src={listing.photos[0]}
            alt={listing.title}
            fill
            sizes="(max-width: 744px) 100vw, 25vw"
            className="object-cover transition-transform duration-300 ease-out group-hover:scale-105"
          />
          {listing.isGuestFavorite && (
            <div className="absolute left-3 top-3">
              <GuestFavoriteBadge />
            </div>
          )}
        </div>
        <div className="flex items-start justify-between">
          <h3 className="text-title-sm text-ink">{listing.title}</h3>
          <span className="flex items-center gap-1 text-body-sm text-ink">
            <span aria-hidden>★</span>
            {listing.rating.toFixed(2)}
          </span>
        </div>
        <p className="text-body-sm text-muted">{listing.location.city}, {listing.location.country}</p>
        <p className="text-body-sm text-ink">
          <span className="font-semibold">${listing.pricePerNight}</span> night
        </p>
      </Link>
      {onToggleSave && (
        <button
          type="button"
          aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
          onClick={onToggleSave}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden
            fill={saved ? "var(--color-rausch)" : "var(--color-icon-scrim)"}
            stroke="white" strokeWidth="2">
            <path d="M12 21s-7-4.35-9.5-8.5C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.5 7-2.5 4.15-9.5 8.5-9.5 8.5z" />
          </svg>
        </button>
      )}
    </article>
  );
}
