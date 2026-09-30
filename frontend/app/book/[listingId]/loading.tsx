import { Footer, TopNav, Skeleton } from "@/components/design-system";

export default function BookLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main
        id="main"
        aria-busy="true"
        aria-label="Loading page"
        className="mx-auto w-full max-w-[1080px] flex-1 px-6 md:px-10 py-8"
      >
        <Skeleton radius="sm" className="mb-8 h-8 w-64" />
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[1fr_320px] lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-4">
            <Skeleton radius="sm" className="h-24 w-full" />
            <Skeleton radius="sm" className="h-24 w-full" />
            <Skeleton radius="sm" className="h-24 w-full" />
          </div>
          <Skeleton radius="md" className="h-80 w-full" />
        </div>
      </main>
      <Footer />
    </div>
  );
}
