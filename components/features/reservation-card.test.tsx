import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReservationCard } from "./reservation-card";

describe("ReservationCard", () => {
  test("shows the nightly price and a disabled Reserve button before dates are chosen", () => {
    render(<ReservationCard pricePerNight={220} maxGuests={4} />);
    expect(screen.getByText(/\$220/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reserve$/i })).toBeDisabled();
  });

  test("enables Reserve and shows a total once a date range is selected", async () => {
    render(<ReservationCard pricePerNight={220} maxGuests={4} />);
    // Pick two days in the currently displayed month (1 and 6 are safe future-or-disabled?
    // Use buttons that are enabled: choose the two largest day numbers present.
    const dayButtons = screen
      .getAllByRole("button")
      .filter((b) => /^\d+$/.test(b.textContent ?? "") && !(b as HTMLButtonElement).disabled);
    expect(dayButtons.length).toBeGreaterThanOrEqual(2);
    await userEvent.click(dayButtons[dayButtons.length - 2]);
    await userEvent.click(dayButtons[dayButtons.length - 1]);
    expect(screen.getByRole("button", { name: /^reserve$/i })).toBeEnabled();
    expect(screen.getByText(/total/i)).toBeInTheDocument();
  });
});
