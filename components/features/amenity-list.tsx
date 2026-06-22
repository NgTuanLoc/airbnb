import { getAmenityIcon } from "@/lib/icons";

export interface AmenityListProps {
  amenities: string[];
}

export function AmenityList({ amenities }: AmenityListProps) {
  return (
    <section className="border-y border-hairline py-8">
      <h2 className="mb-4 text-display-sm text-ink">What this place offers</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2">
        {amenities.map((amenity) => {
          const Icon = getAmenityIcon(amenity);
          return (
            <li key={amenity} className="flex items-center gap-4 py-3 text-body-md text-ink">
              <Icon aria-hidden className="size-6" />
              {amenity}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
