import Image from "next/image";
import type { Listing } from "@/lib/types";
import { NewBadge } from "./badges";

export function ExperienceCard({ listing, isNew }: { listing: Listing; isNew?: boolean }) {
  return (
    <article className="flex flex-col gap-2">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md">
        <Image
          src={listing.photos[0]}
          alt={listing.title}
          fill
          sizes="(max-width: 744px) 100vw, 25vw"
          className="object-cover"
        />
        {isNew && (
          <div className="absolute left-3 top-3">
            <NewBadge />
          </div>
        )}
      </div>
      <h3 className="text-title-md text-ink">{listing.title}</h3>
    </article>
  );
}
