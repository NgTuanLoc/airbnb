import { Footer, TopNav, Skeleton } from "@/components/design-system";

export default function TripLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main
        id="main"
        aria-busy="true"
        aria-label="Loading page"
        className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-8 px-6 md:px-10 py-8"
      >
        <Skeleton radius="sm" className="h-8 w-64" />
        <Skeleton radius="md" className="h-64 w-full" />
        <div className="flex flex-col gap-2">
          <Skeleton radius="xs" className="h-4 w-3/4" />
          <Skeleton radius="xs" className="h-4 w-2/3" />
          <Skeleton radius="xs" className="h-4 w-1/2" />
        </div>
      </main>
      <Footer />
    </div>
  );
}
