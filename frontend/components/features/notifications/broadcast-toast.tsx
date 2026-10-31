"use client";

import { useEffect } from "react";
import { Megaphone, X } from "lucide-react";
import type { Broadcast } from "@/lib/notifications/schemas";

/**
 * An announcement popping up as it arrives, under the nav by the bell that keeps it. The bar along its foot runs down
 * and dismisses it (CSS pauses it while it's pointed at or focused); so do its button and Escape. Screen readers hear
 * it once, from the status region, even while the open panel hides the card.
 */
export function BroadcastToast({
  broadcast,
  hidden,
  onDismiss,
}: Readonly<{ broadcast: Broadcast | null; hidden: boolean; onDismiss: () => void }>) {
  const shown = broadcast !== null && !hidden;

  useEffect(() => {
    if (!shown) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shown, onDismiss]);

  return (
    <>
      {/* Always there, so the announcement is read when its text arrives. */}
      <output className="sr-only">{broadcast ? `Announcement: ${broadcast.text}` : ""}</output>
      {shown && (
        // Keyed by the announcement, so a newer one drops in and starts its own clock.
        <div
          key={broadcast.id}
          className="toast fixed inset-x-4 top-22 z-50 overflow-hidden rounded-md bg-canvas shadow-airbnb md:left-auto md:right-10 md:w-96 xl:right-20"
        >
          <div className="flex items-start gap-4 p-4">
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rausch text-on-primary">
              <Megaphone className="size-5" />
            </span>
            <p className="min-w-0 flex-1 self-center wrap-break-word text-body-md text-ink">{broadcast.text}</p>
            <button
              type="button"
              aria-label="Dismiss announcement"
              onClick={onDismiss}
              className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-surface-soft"
            >
              <X aria-hidden className="size-4 text-ink" />
            </button>
          </div>
          <span aria-hidden onAnimationEnd={onDismiss} className="toast-timer block h-1 bg-rausch" />
        </div>
      )}
    </>
  );
}
