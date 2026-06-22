import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { HomeSearchBar } from "./home-search-bar";

beforeEach(() => {
  push.mockClear();
});

describe("HomeSearchBar", () => {
  test("opens the destination panel when Where is clicked", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    expect(screen.getByRole("textbox", { name: "Where to?" })).toBeInTheDocument();
  });

  test("selecting a destination updates the Where display", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    await userEvent.click(screen.getByRole("button", { name: "Lisbon" }));
    expect(screen.getByRole("button", { name: "Where" }).textContent).toContain("Lisbon");
  });

  test("Escape closes the open panel", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    expect(screen.getByRole("textbox", { name: "Where to?" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Where to?" })).not.toBeInTheDocument();
  });

  test("increasing guests updates the Who display", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Who" }));
    await userEvent.click(screen.getByRole("button", { name: "Increase adults" }));
    expect(screen.getByRole("button", { name: "Who" }).textContent).toContain("1 guest");
  });

  test("search with no input routes to /s/anywhere", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(push).toHaveBeenCalledWith("/s/anywhere");
  });

  test("search with a destination and guests builds the URL", async () => {
    render(<HomeSearchBar />);
    await userEvent.click(screen.getByRole("button", { name: "Where" }));
    await userEvent.click(screen.getByRole("button", { name: "Lisbon" }));
    await userEvent.click(screen.getByRole("button", { name: "Who" }));
    await userEvent.click(screen.getByRole("button", { name: "Increase adults" }));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(push).toHaveBeenCalledWith("/s/Lisbon?guests=1");
  });
});
