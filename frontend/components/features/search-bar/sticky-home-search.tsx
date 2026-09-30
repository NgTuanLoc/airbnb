"use client";

import { useCallback, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useStickySearch } from "@/lib/hooks/use-sticky-search";
import type { SearchSegment } from "@/components/design-system";
import { HomeSearchBar } from "./home-search-bar";
import { MobileSearch } from "./mobile-search";

export function StickyHomeSearch() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const collapsed = useStickySearch(sentinelRef);
  const [expandedWhileCollapsed, setExpandedWhileCollapsed] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const handleActiveChange = useCallback(
    (active: SearchSegment | null) => setIsInteracting(active !== null),
    [],
  );

  // `expanded` is only relevant when the bar is collapsed.
  // When the sentinel re-enters the viewport (collapsed → false), the expansion resets naturally.
  const showPill = collapsed && !expandedWhileCollapsed && !isInteracting;

  function expandFromPill() {
    setExpandedWhileCollapsed(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // When the sentinel becomes visible again (user scrolled to top), reset the expansion flag.
  if (!collapsed && expandedWhileCollapsed) {
    setExpandedWhileCollapsed(false);
  }

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />
      <div className="sticky top-0 z-40 flex justify-center border-b border-hairline bg-canvas px-6 md:px-10 xl:px-20 py-4">
        <div className="w-full md:hidden">
          <MobileSearch />
        </div>
        <div className="hidden md:block">
          {showPill ? (
            <button
              type="button"
              data-testid="search-pill"
              onClick={expandFromPill}
              className="search-morph-in flex h-12 items-center gap-3 rounded-full border border-hairline bg-canvas px-5 shadow-airbnb"
            >
              <span className="text-body-sm font-semibold text-ink">Anywhere</span>
              <span className="h-5 w-px bg-hairline" aria-hidden />
              <span className="text-body-sm text-muted">Any week</span>
              <span className="h-5 w-px bg-hairline" aria-hidden />
              <span className="text-body-sm text-muted">Add guests</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rausch text-on-primary">
                <Search aria-hidden className="size-4" />
              </span>
            </button>
          ) : (
            <div className="search-morph-in">
              <HomeSearchBar onActiveChange={handleActiveChange} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
