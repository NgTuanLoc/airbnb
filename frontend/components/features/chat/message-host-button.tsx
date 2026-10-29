"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/design-system";
import { startConversation } from "@/lib/api-client/chat";

/** Opens (or reopens) the signed-in guest's conversation about this listing. */
export function MessageHostButton({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setPending(true);
    setError(null);
    try {
      const { id } = await startConversation(listingId);
      // Stays disabled while navigating.
      router.push(`/inbox/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-2">
      <Button type="button" variant="secondary" onClick={open} disabled={pending} className="w-full sm:w-auto">
        Message host
      </Button>
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
