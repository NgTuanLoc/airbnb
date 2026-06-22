"use client";

import { useState } from "react";
import { SERVICE_CATEGORIES } from "@/lib/types";
import { useServices } from "@/lib/hooks/use-services";
import { CategoryStrip } from "./category-strip";
import { ServiceGrid } from "./service-grid";

export function ServiceListings() {
  const [active, setActive] = useState<string>("All");
  const { data, isLoading, isError } = useServices(active);

  return (
    <div className="flex flex-col gap-6">
      <CategoryStrip categories={SERVICE_CATEGORIES} active={active} onSelect={setActive} />
      {isError ? (
        <p className="text-body-md text-error">Something went wrong loading services. Please try again.</p>
      ) : (
        <ServiceGrid services={data ?? []} isLoading={isLoading} />
      )}
    </div>
  );
}
