import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { DatePickerDay } from "./date-picker-day";

describe("DatePickerDay", () => {
  test("renders the day number", () => {
    render(<DatePickerDay day={14} />);
    expect(screen.getByRole("button", { name: "14" })).toBeInTheDocument();
  });

  test("selected day uses ink fill and white text", () => {
    render(<DatePickerDay day={14} selected />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-ink");
    expect(btn.className).toContain("text-on-primary");
  });

  test("shrinks to fit narrow calendar columns instead of a fixed size", () => {
    render(<DatePickerDay day={14} />);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("w-full");
    expect(btn.className).toContain("max-w-10");
  });

  test("calls onSelect when clicked", async () => {
    const onSelect = vi.fn();
    render(<DatePickerDay day={14} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  test("disabled day cannot be clicked", async () => {
    const onSelect = vi.fn();
    render(<DatePickerDay day={14} disabled onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
