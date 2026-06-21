import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookingCalendar } from "./booking-calendar";

// June 2026 has 30 days; min date well in the past so all days are enabled.
const month = new Date(2026, 5, 1);
const minDate = new Date(2026, 0, 1);

describe("BookingCalendar", () => {
  test("renders every day of the displayed month", () => {
    render(<BookingCalendar month={month} checkIn={null} checkOut={null} minDate={minDate} onSelect={vi.fn()} onMonthChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "31" })).not.toBeInTheDocument();
  });

  test("calls onSelect with the clicked date", async () => {
    const onSelect = vi.fn();
    render(<BookingCalendar month={month} checkIn={null} checkOut={null} minDate={minDate} onSelect={onSelect} onMonthChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "10" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const arg = onSelect.mock.calls[0][0] as Date;
    expect(arg.getFullYear()).toBe(2026);
    expect(arg.getMonth()).toBe(5);
    expect(arg.getDate()).toBe(10);
  });

  test("advances the month when the next control is pressed", async () => {
    const onMonthChange = vi.fn();
    render(<BookingCalendar month={month} checkIn={null} checkOut={null} minDate={minDate} onSelect={vi.fn()} onMonthChange={onMonthChange} />);
    await userEvent.click(screen.getByRole("button", { name: /next month/i }));
    const arg = onMonthChange.mock.calls[0][0] as Date;
    expect(arg.getMonth()).toBe(6);
  });
});
