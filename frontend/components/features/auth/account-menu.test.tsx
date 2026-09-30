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

    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register");
  });

  test("logged in: shows the initial and links to wishlists and trips", async () => {
    renderWith(loggedIn());
    const button = screen.getByRole("button", { name: "Account menu" });
    expect(button).toHaveTextContent("A");

    await userEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Wishlists" })).toHaveAttribute("href", "/wishlists");
    expect(screen.getByRole("link", { name: "Trips" })).toHaveAttribute("href", "/trips");
  });

  test("Escape closes it and returns focus to the button", async () => {
    renderWith(loggedIn());
    const button = screen.getByRole("button", { name: "Account menu" });
    await userEvent.click(button);

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("link", { name: "Trips" })).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });

  test("a click outside closes it", async () => {
    renderWith(loggedIn());
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));

    await userEvent.click(document.body);

    expect(screen.queryByRole("link", { name: "Trips" })).not.toBeInTheDocument();
  });

  test("log out calls the session's logout", async () => {
    const logout = vi.fn();
    renderWith(loggedIn(logout));
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(logout).toHaveBeenCalled();
  });

  test("logged in: links to the host dashboard", async () => {
    renderWith(loggedIn());
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("link", { name: "Host dashboard" })).toHaveAttribute("href", "/host/listings");
  });

  test("a failed logout shows an inline error instead of failing silently", async () => {
    const logout = vi.fn().mockRejectedValueOnce(new Error("offline"));
    renderWith(loggedIn(logout));
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't log you out. Try again.");
  });

  test("the menu trigger is at least 44px tall", () => {
    renderWith(null);
    expect(screen.getByRole("button", { name: "Account menu" }).className).toContain("h-11");
  });

  test("the avatar initial sits on the text-safe rausch fill", () => {
    renderWith(loggedIn());
    const initial = screen.getByRole("button", { name: "Account menu" }).querySelector("span");
    expect(initial).toHaveTextContent("A");
    expect(initial?.className).toContain("bg-rausch-text-bg");
  });
});
