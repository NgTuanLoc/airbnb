import { Skeleton } from "@/components/design-system";

export interface CardGridSkeletonProps {
  count?: number;
}

export function CardGridSkeleton({ count = 8 }: CardGridSkeletonProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} data-testid="grid-card-skeleton" className="flex flex-col gap-2">
          <Skeleton radius="md" className="aspect-square w-full" />
          <Skeleton radius="xs" className="h-4 w-3/4" />
          <Skeleton radius="xs" className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
