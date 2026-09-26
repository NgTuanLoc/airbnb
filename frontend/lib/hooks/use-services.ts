import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchServices } from "@/lib/api-client/services";
import type { Service } from "@/lib/types";

export function useServices(category?: string): UseQueryResult<Service[]> {
  return useQuery({
    queryKey: ["services", category ?? "All"],
    queryFn: () => fetchServices(category),
  });
}
