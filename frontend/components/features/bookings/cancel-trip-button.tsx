"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/design-system";
import { cancelBooking } from "@/lib/api-client/availability";

function CancelTripDialog({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A native modal; it unmounts on close, so focus goes back by hand to the opener.
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await cancelBooking(bookingId);
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="cancel-trip-title"
      onClose={onClose}
      className="m-auto w-full max-w-md rounded-md bg-canvas p-0 shadow-airbnb backdrop:bg-scrim/50"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id="cancel-trip-title" className="text-title-md text-ink">Cancel this trip?</h2>
        <p className="text-body-md text-body">Your nights will be released and you won&apos;t be charged.</p>
        {error && (
          <p role="alert" className="text-body-sm text-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="tertiary" onClick={onClose}>Keep trip</Button>
          <Button type="button" disabled={busy} onClick={confirm}>Cancel trip</Button>
        </div>
      </div>
    </dialog>
  );
}

export function CancelTripButton({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" className="w-fit" onClick={() => setOpen(true)}>Cancel trip</Button>
      {open && <CancelTripDialog bookingId={bookingId} onClose={() => setOpen(false)} />}
    </>
  );
}
