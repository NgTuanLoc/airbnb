"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// While a booking's payment is processing, the server renders the page again every few seconds, so the guest sees it
// confirmed (or declined) without reloading. It stops after a while: a payment can stay pending for long (and in mock
// mode forever), and a reload still shows the news.
export function RefreshWhilePending({
  intervalMs = 3000,
  maxMs = 120_000,
}: Readonly<{ intervalMs?: number; maxMs?: number }>) {
  const router = useRouter();

  useEffect(() => {
    let refreshesLeft = Math.floor(maxMs / intervalMs);
    const timer = setInterval(() => {
      router.refresh();
      refreshesLeft -= 1;
      if (refreshesLeft <= 0) clearInterval(timer);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs, maxMs]);

  return null;
}
