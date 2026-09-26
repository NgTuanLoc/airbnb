"use client";

import { useState } from "react";
import { EXPERIENCE_CATEGORIES } from "@/lib/types";
import { useExperiences } from "@/lib/hooks/use-experiences";
import { CategoryStrip } from "./category-strip";
import { ExperienceGrid } from "./experience-grid";

export function ExperienceListings() {
  const [active, setActive] = useState<string>("All");
  const { data, isLoading, isError } = useExperiences(active);

  return (
    <div className="flex flex-col gap-6">
      <CategoryStrip categories={EXPERIENCE_CATEGORIES} active={active} onSelect={setActive} />
      {isError ? (
        <p className="text-body-md text-error">Something went wrong loading experiences. Please try again.</p>
      ) : (
        <ExperienceGrid experiences={data ?? []} isLoading={isLoading} />
      )}
    </div>
  );
}
