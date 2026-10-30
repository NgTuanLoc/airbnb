import { Skeleton } from "@/components/design-system";

// One per placeholder field; the names only key the list.
const FIELDS = ["field-1", "field-2", "field-3", "field-4"];

export function FormSkeleton() {
  return (
    <div data-testid="form-skeleton" className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <Skeleton radius="sm" className="h-8 w-64" />
      {FIELDS.map((field) => (
        <div key={field} data-testid="form-skeleton-field" className="flex flex-col gap-2">
          <Skeleton radius="xs" className="h-4 w-24" />
          <Skeleton radius="sm" className="h-12 w-full" />
        </div>
      ))}
      <Skeleton radius="sm" className="h-12 w-32" />
    </div>
  );
}
