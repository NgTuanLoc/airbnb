import { describe, expect, test } from "vitest";
import { cardOutcome, PAYMENT_ERRORS } from "./payment";

const today = new Date("2026-10-28T12:00:00Z");
const card = (number: string, overrides: Partial<{ expMonth: number; expYear: number; cvc: string }> = {}) => ({
  number, expMonth: 12, expYear: 2030, cvc: "123", ...overrides,
});

describe("cardOutcome (mock mode's payment service)", () => {
  test.each([
    ["4242 4242 4242 4242", "succeeded"],
    ["5555555555554444", "succeeded"],
    ["4000000000000119", "succeeded"],
    ["4000000000000002", "card_declined"],
    ["4000000000009995", "insufficient_funds"],
    ["4000000000000077", "pending"],
    ["4242424242424241", "invalid_card"],
    ["4242-4242-4242-4242", "invalid_card"],
  ])("%s → %s", (number, outcome) => {
    expect(cardOutcome(card(number), today)).toBe(outcome);
  });

  test("a past expiry or a malformed CVC is invalid; this month still works", () => {
    expect(cardOutcome(card("4242424242424242", { expYear: 2026, expMonth: 9 }), today)).toBe("invalid_card");
    expect(cardOutcome(card("4242424242424242", { expYear: 2026, expMonth: 10 }), today)).toBe("succeeded");
    expect(cardOutcome(card("4242424242424242", { cvc: "12" }), today)).toBe("invalid_card");
    expect(cardOutcome(card("378282246310005", { cvc: "123" }), today)).toBe("invalid_card");
    expect(cardOutcome(card("378282246310005", { cvc: "1234" }), today)).toBe("succeeded");
  });

  test("each payment error has the backend's status and wording", () => {
    expect(PAYMENT_ERRORS).toEqual({
      card_declined: { status: 402, message: "Your card was declined" },
      insufficient_funds: { status: 402, message: "Your card has insufficient funds" },
      invalid_card: { status: 400, message: "Check your card details" },
    });
  });
});
