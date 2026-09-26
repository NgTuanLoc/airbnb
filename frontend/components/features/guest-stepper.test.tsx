import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuestStepper, type GuestCounts } from "./guest-stepper";

const value: GuestCounts = { adults: 1, children: 0 };

describe("GuestStepper", () => {
  test("increments adults when the add button is pressed", async () => {
    const onChange = vi.fn();
    render(<GuestStepper value={value} onChange={onChange} maxGuests={4} />);
    await userEvent.click(screen.getByRole("button", { name: /increase adults/i }));
    expect(onChange).toHaveBeenCalledWith({ adults: 2, children: 0 });
  });

  test("disables decreasing adults below one", () => {
    render(<GuestStepper value={value} onChange={vi.fn()} maxGuests={4} />);
    expect(screen.getByRole("button", { name: /decrease adults/i })).toBeDisabled();
  });

  test("disables increasing when the total reaches maxGuests", () => {
    render(<GuestStepper value={{ adults: 2, children: 2 }} onChange={vi.fn()} maxGuests={4} />);
    expect(screen.getByRole("button", { name: /increase adults/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /increase children/i })).toBeDisabled();
  });
});
