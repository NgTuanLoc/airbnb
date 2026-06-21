import "maplibre-gl/dist/maplibre-gl.css";
import { Suspense } from "react";
import { TopNav } from "@/components/design-system";
import { SearchResults } from "@/components/features/search/search-results";

export default async function SearchPage({ params }: { params: Promise<{ location: string }> }) {
  const { location } = await params;
  const decoded = decodeURIComponent(location);

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav active="homes" />
      <Suspense fallback={<div className="px-6 py-8 text-body-md text-muted">Loading stays…</div>}>
        <SearchResults location={decoded} />
      </Suspense>
    </div>
  );
}
