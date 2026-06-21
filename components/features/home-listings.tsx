"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/types";
import { useListings } from "@/lib/hooks/use-listings";
import { CategoryStrip } from "./category-strip";
import { PropertyGrid } from "./property-grid";

export function HomeListings() {
  const [active, setActive] = useState<string>("All");
  const { data, isLoading, isError } = useListings(active);

  return (
    <div className="flex flex-col gap-6">
      <CategoryStrip categories={CATEGORIES} active={active} onSelect={setActive} />
      {isError ? (
        <p className="text-body-md text-error">Something went wrong loading places. Please try again.</p>
      ) : (
        <PropertyGrid listings={data ?? []} isLoading={isLoading} />
      )}
    </div>
  );
}
