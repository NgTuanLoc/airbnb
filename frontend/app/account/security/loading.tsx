import { Footer, Skeleton, TopNav } from "@/components/design-system";

export default function SecurityLoading() {
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
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} data-testid="security-section-skeleton" className="flex flex-col gap-4">
            <Skeleton radius="xs" className="h-5 w-40" />
            <Skeleton radius="md" className="h-32 w-full" />
          </div>
        ))}
      </main>
      <Footer />
    </div>
  );
}
