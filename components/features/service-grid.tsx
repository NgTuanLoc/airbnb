import Link from "next/link";
import { ServiceCard } from "@/components/design-system";
import type { Service } from "@/lib/types";

export interface ServiceGridProps {
  services: Service[];
  isLoading?: boolean;
}

const gridClass = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4";

function Skeleton() {
  return (
    <div data-testid="service-skeleton" className="flex flex-col gap-2">
      <div className="aspect-[4/5] w-full animate-pulse rounded-md bg-surface-strong" />
      <div className="h-4 w-3/4 animate-pulse rounded-xs bg-surface-strong" />
    </div>
  );
}

export function ServiceGrid({ services, isLoading }: ServiceGridProps) {
  if (isLoading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  }

  if (services.length === 0) {
    return <p className="text-body-md text-muted">No services match this category yet.</p>;
  }

  return (
    <div className={gridClass}>
      {services.map((service) => (
        <Link key={service.id} href={`/services/${service.id}`}>
          <ServiceCard service={service} />
        </Link>
      ))}
    </div>
  );
}
