import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchListings } from "@/lib/api-client/listings";
import type { Listing } from "@/lib/types";

export function useListings(category?: string): UseQueryResult<Listing[]> {
  return useQuery({
    queryKey: ["listings", category ?? "All"],
    queryFn: () => fetchListings(category),
  });
}
