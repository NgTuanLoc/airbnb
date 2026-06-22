import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { StickyHomeSearch } from "./sticky-home-search";

// Control the collapse state directly.
const collapsed = { value: false };
vi.mock("@/lib/hooks/use-sticky-search", () => ({
  useStickySearch: () => collapsed.value,
}));

// HomeSearchBar (rendered in the expanded branch) calls useRouter; stub it.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("StickyHomeSearch", () => {
  test("shows the full search bar when not collapsed", () => {
    collapsed.value = false;
    render(<StickyHomeSearch />);
    expect(screen.queryByTestId("search-pill")).not.toBeInTheDocument();
    // Full bar exposes the segment buttons.
    expect(screen.getByRole("button", { name: "Where" })).toBeInTheDocument();
  });

  test("shows the compact pill when collapsed", () => {
    collapsed.value = true;
    render(<StickyHomeSearch />);
    expect(screen.getByTestId("search-pill")).toBeInTheDocument();
  });

  test("clicking the pill expands the full bar", async () => {
    collapsed.value = true;
    window.scrollTo = vi.fn();
    render(<StickyHomeSearch />);
    await userEvent.click(screen.getByTestId("search-pill"));
    expect(screen.getByRole("button", { name: "Where" })).toBeInTheDocument();
  });
});
