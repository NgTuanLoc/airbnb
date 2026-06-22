import Image from "next/image";
import type { Service } from "@/lib/types";

export function ServiceCard({ service }: { service: Service }) {
  return (
    <article className="flex flex-col gap-2">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md">
        <Image
          src={service.photos[0]}
          alt={service.title}
          fill
          sizes="(max-width: 744px) 100vw, 25vw"
          className="object-cover"
        />
      </div>
      <h3 className="text-title-md text-ink">{service.title}</h3>
      <p className="text-body-sm text-muted">{service.provider}</p>
      <p className="text-body-sm text-ink">From ${service.price}</p>
    </article>
  );
}
