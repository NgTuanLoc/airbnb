"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchBar, type SearchSegment } from "@/components/design-system";
import type { GuestCounts } from "@/components/features/guest-stepper";
import { cities } from "@/lib/data/cities";
import { DestinationPanel } from "./destination-panel";
import { DatePanel } from "./date-panel";
import { GuestPanel } from "./guest-panel";

function toISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShort(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function buildSearchUrl(destination: string, guests: GuestCounts, checkIn: Date | null, checkOut: Date | null): string {
  const trimmed = destination.trim();
  const dest = trimmed ? encodeURIComponent(trimmed) : "anywhere";
  const params = new URLSearchParams();
  const total = guests.adults + guests.children;
  if (total > 0) params.set("guests", String(total));
  if (checkIn) params.set("checkIn", toISO(checkIn));
  if (checkOut) params.set("checkOut", toISO(checkOut));
  const qs = params.toString();
  return qs ? `/s/${dest}?${qs}` : `/s/${dest}`;
}

export function HomeSearchBar() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<SearchSegment | null>(null);
  const [destination, setDestination] = useState("");
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [guests, setGuests] = useState<GuestCounts>({ adults: 0, children: 0 });

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

  function handleSelectDate(date: Date) {
    if (!checkIn || checkOut) {
      setCheckIn(date);
      setCheckOut(null);
    } else if (date > checkIn) {
      setCheckOut(date);
    } else {
      setCheckIn(date);
    }
  }

  function handleSearch() {
    router.push(buildSearchUrl(destination, guests, checkIn, checkOut));
  }

  const total = guests.adults + guests.children;
  const whenLabel =
    checkIn && checkOut
      ? `${formatShort(checkIn)} – ${formatShort(checkOut)}`
      : checkIn
        ? formatShort(checkIn)
        : "Add dates";
  const whoLabel = total > 0 ? `${total} ${total === 1 ? "guest" : "guests"}` : "Add guests";

  return (
    <div ref={containerRef} className="relative">
      <SearchBar
        values={{ where: destination || "Search destinations", when: whenLabel, who: whoLabel }}
        activeSegment={active}
        onSegmentClick={handleSegmentClick}
        onSearch={handleSearch}
      />
      {active && (
        <div className="search-pop-in absolute left-0 top-full z-50 mt-3 rounded-md border border-hairline bg-canvas p-6 shadow-airbnb">
          {active === "where" && (
            <DestinationPanel
              value={destination}
              suggestions={cities}
              onChange={setDestination}
              onSelect={(name) => {
                setDestination(name);
                setActive("when");
              }}
            />
          )}
          {active === "when" && <DatePanel checkIn={checkIn} checkOut={checkOut} onSelect={handleSelectDate} />}
          {active === "who" && <GuestPanel value={guests} onChange={setGuests} />}
        </div>
      )}
    </div>
  );
}
