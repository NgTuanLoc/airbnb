import { TopNav, Footer } from "@/components/design-system";
import { DetailSkeleton } from "@/components/features/skeletons/detail-skeleton";

export default function ServiceDetailLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="services" />
      <main className="flex-1">
        <DetailSkeleton />
      </main>
      <Footer />
    </div>
  );
}
