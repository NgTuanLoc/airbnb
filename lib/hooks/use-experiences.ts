import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchExperiences } from "@/lib/api-client/experiences";
import type { Experience } from "@/lib/types";

export function useExperiences(category?: string): UseQueryResult<Experience[]> {
  return useQuery({
    queryKey: ["experiences", category ?? "All"],
    queryFn: () => fetchExperiences(category),
  });
}
