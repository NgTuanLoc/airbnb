import { Footer, TopNav, Skeleton } from "@/components/design-system";

export default function TripsLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main
        id="main"
        aria-busy="true"
        aria-label="Loading page"
        className="mx-auto flex w-full max-w-editorial flex-1 flex-col gap-8 px-6 md:px-10 xl:px-20 py-8"
      >
        <Skeleton radius="sm" className="h-8 w-64" />
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} data-testid="trip-row-skeleton" className="flex gap-4">
              <Skeleton radius="sm" className="size-24 shrink-0" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton radius="xs" className="h-4 w-1/2" />
                <Skeleton radius="xs" className="h-4 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
