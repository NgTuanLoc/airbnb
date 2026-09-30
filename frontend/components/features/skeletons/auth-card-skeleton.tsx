import { Skeleton } from "@/components/design-system";

export function AuthCardSkeleton() {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center bg-surface-soft px-6 py-12">
      <div
        data-testid="auth-card-skeleton"
        aria-busy="true"
        aria-label="Loading page"
        className="w-full max-w-md rounded-md border border-hairline bg-canvas p-8 shadow-airbnb"
      >
        <Skeleton radius="xs" className="mb-6 h-8 w-32" />
        <Skeleton radius="xs" className="h-6 w-48" />
        <div className="mt-6 flex flex-col gap-4">
          <Skeleton radius="sm" className="h-12 w-full" />
          <Skeleton radius="sm" className="h-12 w-full" />
          <Skeleton radius="sm" className="h-12 w-32" />
        </div>
      </div>
    </main>
  );
}
