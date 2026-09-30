import { Footer, TopNav } from "@/components/design-system";
import { FormSkeleton } from "@/components/features/skeletons/form-skeleton";

export default function EditListingLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav active="homes" />
      <main id="main" aria-busy="true" aria-label="Loading page" className="w-full flex-1 px-6 py-8">
        <FormSkeleton />
      </main>
      <Footer />
    </div>
  );
}
