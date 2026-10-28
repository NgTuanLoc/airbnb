"use client";

import { useEffect, useRef } from "react";

/**
 * Records one view of the listing per page view. From the browser, not the server render, so link prefetches and
 * crawlers that never run scripts don't count. The page leaves it out for the listing's own host.
 */
export function ListingViewBeacon({ listingId }: { listingId: string }) {
  // Strict mode runs effects twice in development; the ref survives that, so the view is still sent once.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    // keepalive: the ping survives the guest navigating away straight after. A lost view only makes a count low.
    fetch(`/api/listings/${encodeURIComponent(listingId)}/views`, { method: "POST", keepalive: true }).catch(() => {});
  }, [listingId]);

  return null;
}
