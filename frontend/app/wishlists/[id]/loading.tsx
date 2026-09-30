import { Footer, TopNav, Skeleton } from "@/components/design-system";
import { CardGridSkeleton } from "@/components/features/skeletons/card-grid-skeleton";

export default function WishlistLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main
        id="main"
        aria-busy="true"
        aria-label="Loading page"
        className="mx-auto w-full max-w-listing flex-1 px-6 md:px-10 xl:px-20 py-8"
      >
        <Skeleton radius="sm" className="mb-8 h-8 w-64" />
        <CardGridSkeleton />
      </main>
      <Footer />
    </div>
  );
}
