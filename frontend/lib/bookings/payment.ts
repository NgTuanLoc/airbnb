import { z } from "zod";

/** Passed through to the payment service once; never stored. */
export const cardSchema = z.object({
  number: z.string().max(30),
  expMonth: z.coerce.number().int(),
  expYear: z.coerce.number().int(),
  cvc: z.string().max(4),
});

export type CardInput = z.infer<typeof cardSchema>;

export type PaymentError = "card_declined" | "insufficient_funds" | "invalid_card";

/** The backend's status and wording for each refused payment. */
export const PAYMENT_ERRORS: Record<PaymentError, { status: 400 | 402; message: string }> = {
  card_declined: { status: 402, message: "Your card was declined" },
  insufficient_funds: { status: 402, message: "Your card has insufficient funds" },
  invalid_card: { status: 400, message: "Check your card details" },
};

/** Stripe-style test cards, shown under the card form. */
export const TEST_CARDS: ReadonlyArray<{ number: string; result: string }> = [
  { number: "4242 4242 4242 4242", result: "succeeds" },
  { number: "4000 0000 0000 0002", result: "is declined" },
  { number: "4000 0000 0000 9995", result: "has insufficient funds" },
  { number: "4000 0000 0000 0077", result: "stays processing" },
];

function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2;
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Mock mode's stand-in for the payment service: the same test cards and the same card checks. */
export function cardOutcome(card: CardInput, today: Date): PaymentError | "pending" | "succeeded" {
  const digits = card.number.replaceAll(" ", "");
  const expired = card.expYear * 12 + card.expMonth < today.getUTCFullYear() * 12 + today.getUTCMonth() + 1;
  const cvcLength = digits.startsWith("3") ? 4 : 3;
  if (!/^\d{13,19}$/.test(digits) || !passesLuhn(digits) || card.expMonth < 1 || card.expMonth > 12 || expired
    || !new RegExp(`^\\d{${cvcLength}}$`).test(card.cvc)) {
    return "invalid_card";
  }
  if (digits === "4000000000000002") return "card_declined";
  if (digits === "4000000000009995") return "insufficient_funds";
  if (digits === "4000000000000077") return "pending";
  return "succeeded";
}
