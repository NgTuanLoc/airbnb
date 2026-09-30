import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent, within } from "@/lib/test-utils";
import { MobileSearch } from "./mobile-search";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("MobileSearch", () => {
  beforeEach(() => push.mockReset());

  test("the pill opens a search dialog focused on the destination field", async () => {
    render(<MobileSearch />);
    await userEvent.click(screen.getByRole("button", { name: /start your search/i }));
    const dialog = screen.getByRole("dialog", { name: "Search" });
    expect(within(dialog).getByRole("textbox", { name: "Where to?" })).toHaveFocus();
  });

  test("choosing a city moves on to When, and Search pushes the same url as desktop", async () => {
    render(<MobileSearch />);
    await userEvent.click(screen.getByRole("button", { name: /start your search/i }));
    const dialog = screen.getByRole("dialog", { name: "Search" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Aspen" }));
    expect(within(dialog).getByRole("button", { name: /^when/i })).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(within(dialog).getByRole("button", { name: /^who/i }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Increase adults" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Search" }));
    expect(push).toHaveBeenCalledWith("/s/Aspen?guests=1");
  });

  test("choosing a city moves focus to the When header, since its own button unmounts", async () => {
    render(<MobileSearch />);
    await userEvent.click(screen.getByRole("button", { name: /start your search/i }));
    const dialog = screen.getByRole("dialog", { name: "Search" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Aspen" }));
    expect(within(dialog).getByRole("button", { name: /^when/i })).toHaveFocus();
  });

  test("Clear all resets the choices and closing returns focus to the pill", async () => {
    render(<MobileSearch />);
    const pill = screen.getByRole("button", { name: /start your search/i });
    await userEvent.click(pill);
    const dialog = screen.getByRole("dialog", { name: "Search" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Where to?" }), "Kyo");
    await userEvent.click(within(dialog).getByRole("button", { name: "Clear all" }));
    expect(within(dialog).getByRole("textbox", { name: "Where to?" })).toHaveValue("");
    await userEvent.click(within(dialog).getByRole("button", { name: "Close search" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pill).toHaveFocus();
  });
});
