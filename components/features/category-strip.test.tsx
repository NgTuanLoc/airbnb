import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { CategoryStrip } from "./category-strip";

const categories = ["All", "Cabins", "Beachfront"] as const;

describe("CategoryStrip", () => {
  test("renders a button per category", () => {
    render(<CategoryStrip categories={categories} active="All" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Cabins" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beachfront" })).toBeInTheDocument();
  });

  test("the active category gets the ink underline", () => {
    render(<CategoryStrip categories={categories} active="Cabins" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Cabins" }).className).toContain("border-ink");
  });

  test("clicking a category calls onSelect with its name", async () => {
    const onSelect = vi.fn();
    render(<CategoryStrip categories={categories} active="All" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "Beachfront" }));
    expect(onSelect).toHaveBeenCalledWith("Beachfront");
  });

  test("renders an icon for each category", () => {
    const { container } = render(
      <CategoryStrip categories={categories} active="All" onSelect={() => {}} />,
    );
    expect(container.querySelectorAll("svg.lucide")).toHaveLength(categories.length);
  });
});
