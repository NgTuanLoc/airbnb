import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterBar } from "./filter-bar";

const categories = ["All", "Cabins", "Beachfront"] as const;

describe("FilterBar", () => {
  test("selecting a category calls onCategoryChange", async () => {
    const onCategoryChange = vi.fn();
    render(<FilterBar categories={categories} activeCategory="All" onCategoryChange={onCategoryChange} activeFilterCount={0} onOpenFilters={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cabins" }));
    expect(onCategoryChange).toHaveBeenCalledWith("Cabins");
  });

  test("the filters button shows the active count and opens the panel", async () => {
    const onOpenFilters = vi.fn();
    render(<FilterBar categories={categories} activeCategory="All" onCategoryChange={vi.fn()} activeFilterCount={2} onOpenFilters={onOpenFilters} />);
    const button = screen.getByRole("button", { name: /filters/i });
    expect(button).toHaveTextContent("2");
    await userEvent.click(button);
    expect(onOpenFilters).toHaveBeenCalled();
  });
});
