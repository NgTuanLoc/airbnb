export interface AmenityListProps {
  amenities: string[];
}

export function AmenityList({ amenities }: AmenityListProps) {
  return (
    <section className="border-y border-hairline py-8">
      <h2 className="mb-4 text-display-sm text-ink">What this place offers</h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2">
        {amenities.map((amenity) => (
          <li key={amenity} className="py-3 text-body-md text-ink">
            {amenity}
          </li>
        ))}
      </ul>
    </section>
  );
}
