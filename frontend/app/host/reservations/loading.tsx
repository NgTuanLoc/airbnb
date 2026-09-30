import { Footer, TopNav, Skeleton } from "@/components/design-system";

export default function HostReservationsLoading() {
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
        <div className="flex flex-col divide-y divide-hairline">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} data-testid="host-reservation-row-skeleton" className="py-4">
              <Skeleton radius="xs" className="h-4 w-full" />
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
