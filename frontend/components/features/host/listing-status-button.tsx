"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/design-system";
import { setHostListingStatus } from "@/lib/api-client/host";

export function ListingStatusButton({ listingId, status }: { listingId: string; status: "listed" | "unlisted" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = status === "listed" ? "unlisted" : "listed";

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      await setHostListingStatus(listingId, next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="secondary" onClick={toggle} disabled={pending} className="h-10 px-4">
        {status === "listed" ? "Unlist" : "Relist"}
      </Button>
      {error && <p role="alert" className="text-body-sm text-error">{error}</p>}
    </div>
  );
}
