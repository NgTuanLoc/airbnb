"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchBar, type SearchSegment } from "@/components/design-system";
import { cities } from "@/lib/data/cities";
import { useSearchForm } from "@/lib/search/use-search-form";
import { DestinationPanel } from "./destination-panel";
import { DatePanel } from "./date-panel";
import { GuestPanel } from "./guest-panel";

interface HomeSearchBarProps {
  onActiveChange?: (active: SearchSegment | null) => void;
}

export function HomeSearchBar({ onActiveChange }: HomeSearchBarProps = {}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<SearchSegment | null>(null);
  const form = useSearchForm();

  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActive(null);
    }
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActive(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [active]);

  function handleSegmentClick(segment: SearchSegment) {
    setActive((current) => (current === segment ? null : segment));
  }

  function handleSearch() {
    router.push(form.url);
  }

  return (
    <div ref={containerRef} className="relative">
      <SearchBar
        values={{ where: form.destination || "Search destinations", when: form.whenLabel, who: form.whoLabel }}
        activeSegment={active}
        onSegmentClick={handleSegmentClick}
        onSearch={handleSearch}
      />
      {active && (
        <div className="search-pop-in absolute left-0 top-full z-50 mt-3 rounded-md border border-hairline bg-canvas p-6 shadow-airbnb">
          {active === "where" && (
            <DestinationPanel
              value={form.destination}
              suggestions={cities}
              onChange={form.setDestination}
              onSelect={(name) => {
                form.setDestination(name);
                setActive("when");
              }}
            />
          )}
          {active === "when" && <DatePanel checkIn={form.checkIn} checkOut={form.checkOut} onSelect={form.selectDate} />}
          {active === "who" && <GuestPanel value={form.guests} onChange={form.setGuests} />}
        </div>
      )}
    </div>
  );
}
