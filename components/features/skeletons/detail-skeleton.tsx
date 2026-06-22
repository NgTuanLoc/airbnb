import { Skeleton } from "@/components/design-system";

export function DetailSkeleton() {
  return (
    <div data-testid="detail-skeleton" className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-8">
      <Skeleton radius="sm" className="h-8 w-1/2" />
      <Skeleton radius="md" className="aspect-[2/1] w-full" />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.7fr_1fr]">
        <div className="flex flex-col gap-3">
          <Skeleton radius="xs" className="h-4 w-3/4" />
          <Skeleton radius="xs" className="h-4 w-2/3" />
          <Skeleton radius="xs" className="h-4 w-1/2" />
          <Skeleton radius="xs" className="h-4 w-5/6" />
        </div>
        <Skeleton radius="md" className="h-64 w-full" />
      </div>
    </div>
  );
}
