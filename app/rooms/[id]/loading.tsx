import { TopNav, Footer } from "@/components/design-system";
import { DetailSkeleton } from "@/components/features/skeletons/detail-skeleton";

export default function RoomLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main className="flex-1">
        <DetailSkeleton />
      </main>
      <Footer />
    </div>
  );
}
