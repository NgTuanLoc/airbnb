import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { AccountMenu } from "./account-menu";
import { SessionContext, type SessionState } from "./session-provider";

function renderWith(state: SessionState | null) {
  return render(
    state ? <SessionContext.Provider value={state}><AccountMenu /></SessionContext.Provider> : <AccountMenu />,
  );
}

const loggedIn = (logout = vi.fn()): SessionState => ({
  user: { id: "u-ana@example.com", name: "ana", email: "ana@example.com" },
  isLoading: false,
  refresh: vi.fn(),
  logout,
});

describe("AccountMenu", () => {
  test("logged out (or outside the provider): offers log in and sign up", async () => {
    renderWith(null);
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getByRole("menuitem", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("menuitem", { name: "Sign up" })).toHaveAttribute("href", "/register");
  });

  test("logged in: shows the initial and links to wishlists and trips", async () => {
    renderWith(loggedIn());
    const button = screen.getByRole("button", { name: "Account menu" });
    expect(button).toHaveTextContent("A");

    await userEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Wishlists" })).toHaveAttribute("href", "/wishlists");
    expect(screen.getByRole("menuitem", { name: "Trips" })).toHaveAttribute("href", "/trips");
  });

  test("log out calls the session's logout", async () => {
    const logout = vi.fn();
    renderWith(loggedIn(logout));
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));

    await userEvent.click(screen.getByRole("menuitem", { name: "Log out" }));

    expect(logout).toHaveBeenCalled();
  });
});
