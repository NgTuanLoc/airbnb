import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterPanel } from "./filter-panel";

describe("FilterPanel", () => {
  test("applies the entered price and stepped guests", async () => {
    const onApply = vi.fn();
    render(<FilterPanel initial={{}} onApply={onApply} onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/minimum price/i), "150");
    await userEvent.click(screen.getByRole("button", { name: /increase guests/i }));
    await userEvent.click(screen.getByRole("button", { name: /show results/i }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ minPrice: 150, guests: 1 }));
  });

  test("clear all resets the draft", async () => {
    const onApply = vi.fn();
    render(<FilterPanel initial={{ minPrice: 200, guests: 3 }} onApply={onApply} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /clear all/i }));
    await userEvent.click(screen.getByRole("button", { name: /show results/i }));
    expect(onApply).toHaveBeenCalledWith({});
  });

  test("closes when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(<FilterPanel initial={{}} onApply={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByTestId("filter-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
