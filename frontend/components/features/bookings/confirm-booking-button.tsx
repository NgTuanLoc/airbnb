"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button, TextInput } from "@/components/design-system";
import { createBooking } from "@/lib/api-client/bookings";
import { TEST_CARDS } from "@/lib/bookings/payment";
import type { BookingRequest } from "@/lib/bookings/schemas";

const EXPIRY = /^(\d{2})\s*\/\s*(\d{2})$/;

// A text field's value; the card fields are never files.
function textOf(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** The payment form: takes a card and books with it. The card goes to our server once and is never kept. */
export function ConfirmBookingButton({ request }: Readonly<{ request: BookingRequest }>) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const expiry = EXPIRY.exec(textOf(form, "expiry").trim());
    if (!expiry) {
      setError("Enter the expiry as MM/YY");
      return;
    }
    const card = {
      number: textOf(form, "number"),
      expMonth: Number(expiry[1]),
      expYear: 2000 + Number(expiry[2]),
      cvc: textOf(form, "cvc"),
    };
    setPending(true);
    setError(null);
    try {
      const booking = await createBooking({ ...request, card });
      // Stays disabled while navigating, so a second click can't book twice. A pending payment shows on the trip page.
      router.push(booking.status === "pending" ? `/trips/${booking.id}` : `/trips/${booking.id}?confirmed=1`);
    } catch (e) {
      // The nights may have just been taken (409); refresh the calendar either way.
      await queryClient.invalidateQueries({ queryKey: ["availability", request.listingId] });
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <form onSubmit={confirm} className="flex flex-col gap-4">
      <h2 className="text-title-md text-ink">Payment</h2>
      <TextInput label="Card number" name="number" inputMode="numeric" autoComplete="cc-number" required />
      <div className="grid grid-cols-2 gap-4">
        <TextInput label="Expiry (MM/YY)" name="expiry" placeholder="MM/YY" autoComplete="cc-exp" required />
        <TextInput label="CVC" name="cvc" inputMode="numeric" autoComplete="cc-csc" maxLength={4} required />
      </div>
      <p className="text-body-sm text-muted">
        Test cards (any future expiry, any CVC): {TEST_CARDS.map((c) => `${c.number} ${c.result}`).join(" · ")}.
      </p>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Confirming…" : "Confirm and pay"}
      </Button>
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
    </form>
  );
}
