"use client";

import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { BROADCAST_STREAM, broadcastSchema, type Broadcast } from "@/lib/notifications/schemas";

function parse(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Announcements broadcast to everyone on the site (the Aspire dashboard's "Broadcast a message"), live over
 * Server-Sent Events. The newest one shows until it's dismissed, and screen readers hear it once.
 */
export function BroadcastToast() {
  const [shown, setShown] = useState<Broadcast | null>(null);

  useEffect(() => {
    // EventSource reconnects by itself, sending the last id it saw, so a dropped connection misses nothing.
    const source = new EventSource(BROADCAST_STREAM);
    source.addEventListener("broadcast", (event) => {
      const broadcast = broadcastSchema.safeParse(parse(event.data));
      if (broadcast.success) setShown(broadcast.data);
    });
    return () => source.close();
  }, []);

  // Escape dismisses it, same as its button.
  useEffect(() => {
    if (!shown) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShown(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shown]);

  return (
    <>
      {/* Always there, so the announcement is read when its text arrives. */}
      <output className="sr-only">{shown ? `Announcement: ${shown.text}` : ""}</output>
      {shown && (
        <div className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-sm bg-ink px-4 py-3 text-body-sm text-on-primary shadow-airbnb focus-ring-inverse">
          <Megaphone aria-hidden className="mt-1 size-4 shrink-0" />
          <p className="min-w-0 flex-1 wrap-break-word">{shown.text}</p>
          <button type="button" aria-label="Dismiss announcement" onClick={() => setShown(null)} className="flex size-8 shrink-0 items-center justify-center rounded-full">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}
