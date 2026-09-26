import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { DatePanel } from "./date-panel";

describe("DatePanel", () => {
  test("renders a month grid with weekday headers", () => {
    render(<DatePanel checkIn={null} checkOut={null} onSelect={() => {}} />);
    // BookingCalendar renders weekday labels; "Mo" is one of them.
    expect(screen.getByText("Mo")).toBeInTheDocument();
  });

  test("advancing the month updates the visible label", async () => {
    render(<DatePanel checkIn={null} checkOut={null} onSelect={() => {}} />);
    const before = screen.getByText(/\b\d{4}\b/).textContent;
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    const after = screen.getByText(/\b\d{4}\b/).textContent;
    expect(after).not.toBe(before);
  });

  test("selecting a day fires onSelect", async () => {
    const onSelect = vi.fn();
    render(<DatePanel checkIn={null} checkOut={null} onSelect={onSelect} />);
    // Click the "15" day button of the visible month (always selectable in a future month).
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    await userEvent.click(screen.getByRole("button", { name: "15" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
