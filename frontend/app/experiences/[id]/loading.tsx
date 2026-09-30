import { TopNav, Footer } from "@/components/design-system";
import { DetailSkeleton } from "@/components/features/skeletons/detail-skeleton";

export default function ExperienceDetailLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="experiences" />
      <main id="main" className="flex-1">
        <DetailSkeleton />
      </main>
      <Footer />
    </div>
  );
}
