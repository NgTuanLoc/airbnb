import Image from "next/image";
import type { Experience } from "@/lib/types";
import { NewBadge } from "./badges";

export function ExperienceCard({ experience }: { experience: Experience }) {
  return (
    <article className="flex flex-col gap-2">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md">
        <Image
          src={experience.photos[0]}
          alt={experience.title}
          fill
          sizes="(max-width: 744px) 100vw, 25vw"
          className="object-cover"
        />
        {experience.isNew && (
          <div className="absolute left-3 top-3">
            <NewBadge />
          </div>
        )}
      </div>
      <h3 className="text-title-md text-ink">{experience.title}</h3>
      <p className="text-body-sm text-muted">From ${experience.pricePerPerson} / person</p>
    </article>
  );
}
