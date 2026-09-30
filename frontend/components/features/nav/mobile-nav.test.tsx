import { describe, expect, test, vi } from "vitest";
import { screen, userEvent, within } from "@/lib/test-utils";
import { render } from "@/lib/test-utils";
import { MobileNav } from "./mobile-nav";
import { SessionContext, type SessionState } from "@/components/features/auth/session-provider";

function renderWithSession(ui: React.ReactElement, session: Pick<SessionState, "user" | "logout"> | null) {
  if (!session) return render(ui);
  const state: SessionState = { isLoading: false, refresh: vi.fn(), ...session };
  return render(<SessionContext.Provider value={state}>{ui}</SessionContext.Provider>);
}

const user = { id: "u-ana@example.com", email: "ana@example.com", name: "Ana" };

describe("MobileNav", () => {
  test("the hamburger is hidden from md up and opens a Menu sheet", async () => {
    renderWithSession(<MobileNav active="experiences" />, null);
    const trigger = screen.getByRole("button", { name: "Open menu" });
    expect(trigger.className).toContain("md:hidden");
    expect(trigger.className).toContain("size-11");
    await userEvent.click(trigger);
    const sheet = screen.getByRole("dialog", { name: "Menu" });
    expect(within(sheet).getByRole("link", { name: /experiences/i })).toHaveAttribute("aria-current", "page");
    expect(within(sheet).getByRole("link", { name: "Become a host" })).toHaveAttribute("href", "/host");
    expect(within(sheet).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  test("shows the account links for a logged-in user", async () => {
    renderWithSession(<MobileNav active="homes" />, { user, logout: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const sheet = screen.getByRole("dialog", { name: "Menu" });
    for (const name of ["Wishlists", "Trips", "Host dashboard"]) {
      expect(within(sheet).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(within(sheet).getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  test("Close menu closes the sheet and returns focus to the hamburger", async () => {
    renderWithSession(<MobileNav active="homes" />, null);
    const trigger = screen.getByRole("button", { name: "Open menu" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test("tapping the backdrop closes the sheet", async () => {
    renderWithSession(<MobileNav active="homes" />, null);
    const trigger = screen.getByRole("button", { name: "Open menu" });
    await userEvent.click(trigger);
    const sheet = screen.getByRole("dialog", { name: "Menu" });
    await userEvent.click(sheet);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("choosing a link closes the sheet", async () => {
    renderWithSession(<MobileNav active="homes" />, null);
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Menu" })).getByRole("link", { name: "Become a host" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("a failed logout shows an inline error", async () => {
    const logout = vi.fn().mockRejectedValueOnce(new Error("offline"));
    renderWithSession(<MobileNav active="homes" />, { user, logout });
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't log you out. Try again.");
  });
});
