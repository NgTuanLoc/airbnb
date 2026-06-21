import Image from "next/image";
import type { City } from "@/lib/types";

export function CityLinkGrid({ cities }: { cities: City[] }) {
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-display-sm text-ink">Inspiration for future getaways</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {cities.map((city) => (
          <article key={city.id} className="flex flex-col gap-2">
            <div className="relative aspect-[3/2] w-full overflow-hidden rounded-md">
              <Image
                src={city.image}
                alt={city.name}
                fill
                sizes="(max-width: 744px) 100vw, 16vw"
                className="object-cover"
              />
            </div>
            <h3 className="text-title-md text-ink">{city.name}</h3>
            <p className="text-body-sm text-muted">{city.subLabel}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
