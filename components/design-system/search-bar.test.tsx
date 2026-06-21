import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { SearchBar } from "./search-bar";

describe("SearchBar", () => {
  test("renders the three segment labels", () => {
    render(<SearchBar />);
    expect(screen.getByText("Where")).toBeInTheDocument();
    expect(screen.getByText("When")).toBeInTheDocument();
    expect(screen.getByText("Who")).toBeInTheDocument();
  });

  test("the orb is a rausch circular search button", () => {
    render(<SearchBar />);
    const orb = screen.getByRole("button", { name: "Search" });
    expect(orb.className).toContain("bg-rausch");
    expect(orb.className).toContain("rounded-full");
  });

  test("clicking the orb triggers onSearch", async () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onSearch).toHaveBeenCalledOnce();
  });
});
