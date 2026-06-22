import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { SearchBar } from "./search-bar";

const values = { where: "Lisbon", when: "Add dates", who: "Add guests" };

describe("SearchBar", () => {
  test("renders the three segment values", () => {
    render(<SearchBar values={values} activeSegment={null} onSegmentClick={() => {}} onSearch={() => {}} />);
    expect(screen.getByText("Lisbon")).toBeInTheDocument();
    expect(screen.getByText("Add dates")).toBeInTheDocument();
    expect(screen.getByText("Add guests")).toBeInTheDocument();
  });

  test("clicking a segment fires onSegmentClick with its key", async () => {
    const onSegmentClick = vi.fn();
    render(<SearchBar values={values} activeSegment={null} onSegmentClick={onSegmentClick} onSearch={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    expect(onSegmentClick).toHaveBeenCalledWith("where");
  });

  test("the active segment carries a highlight class", () => {
    render(<SearchBar values={values} activeSegment="where" onSegmentClick={() => {}} onSearch={() => {}} />);
    expect(screen.getByRole("button", { name: "Where" }).className).toContain("bg-surface-strong");
  });

  test("the orb is a rausch circular button that triggers onSearch", async () => {
    const onSearch = vi.fn();
    render(<SearchBar values={values} activeSegment={null} onSegmentClick={() => {}} onSearch={onSearch} />);
    const orb = screen.getByRole("button", { name: "Search" });
    expect(orb.className).toContain("bg-rausch");
    expect(orb.className).toContain("rounded-full");
    await userEvent.click(orb);
    expect(onSearch).toHaveBeenCalledOnce();
  });
});
