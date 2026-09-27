"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/design-system";
import { createBooking } from "@/lib/api-client/bookings";
import type { BookingRequest } from "@/lib/bookings/schemas";

export function ConfirmBookingButton({ request }: { request: BookingRequest }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const booking = await createBooking(request);
      // Stays disabled while navigating, so a second click can't book twice.
      router.push(`/trips/${booking.id}?confirmed=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={confirm} disabled={pending} className="w-full sm:w-auto">
        {pending ? "Confirming…" : "Confirm and pay"}
      </Button>
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
