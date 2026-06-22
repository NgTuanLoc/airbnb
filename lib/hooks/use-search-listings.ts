import { useQuery, keepPreviousData, type UseQueryResult } from "@tanstack/react-query";
import { fetchSearchListings } from "@/lib/api-client/listings";
import type { Listing } from "@/lib/types";
import type { ListingFilters } from "@/lib/repositories/listing-repository";

export function useSearchListings(filters: ListingFilters): UseQueryResult<Listing[]> {
  return useQuery({
    queryKey: ["search-listings", filters],
    queryFn: () => fetchSearchListings(filters),
    placeholderData: keepPreviousData,
  });
}
