import { TopNav, Footer, Skeleton } from "@/components/design-system";
import { CardGridSkeleton } from "@/components/features/skeletons/card-grid-skeleton";

export default function SearchLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="homes" />
      <div className="flex items-center gap-3 border-b border-hairline px-6 py-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} radius="full" className="h-8 w-20" />
        ))}
      </div>
      <div className="flex flex-1">
        <div className="w-full px-6 py-6 lg:w-[62%]">
          <CardGridSkeleton count={6} />
        </div>
        <div className="hidden lg:block lg:w-[38%]">
          <Skeleton radius="sm" className="h-full min-h-[60vh] w-full" />
        </div>
      </div>
      <Footer />
    </div>
  );
}
