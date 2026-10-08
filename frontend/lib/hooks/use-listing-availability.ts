"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAvailability } from "@/lib/api-client/availability";
import type { Stay } from "@/lib/types";

const NO_STAYS: Stay[] = [];

/** The listing's booked stays for the calendar; empty while loading or if the request fails (the server still refuses overlaps). */
export function useListingAvailability(listingId: string): Stay[] {
  const { data } = useQuery({ queryKey: ["availability", listingId], queryFn: () => fetchAvailability(listingId) });
  return data ?? NO_STAYS;
}
