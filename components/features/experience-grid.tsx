import { ExperienceCard } from "@/components/design-system";
import type { Experience } from "@/lib/types";

export interface ExperienceGridProps {
  experiences: Experience[];
  isLoading?: boolean;
}

const gridClass = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4";

function Skeleton() {
  return (
    <div data-testid="experience-skeleton" className="flex flex-col gap-2">
      <div className="aspect-[4/5] w-full animate-pulse rounded-md bg-surface-strong" />
      <div className="h-4 w-3/4 animate-pulse rounded-xs bg-surface-strong" />
    </div>
  );
}

export function ExperienceGrid({ experiences, isLoading }: ExperienceGridProps) {
  if (isLoading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  }

  if (experiences.length === 0) {
    return <p className="text-body-md text-muted">No experiences match this category yet.</p>;
  }

  return (
    <div className={gridClass}>
      {experiences.map((experience) => (
        <ExperienceCard key={experience.id} experience={experience} />
      ))}
    </div>
  );
}
