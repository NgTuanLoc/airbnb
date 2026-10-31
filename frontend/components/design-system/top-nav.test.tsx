import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@/lib/test-utils";
import { NotificationsProvider } from "@/components/features/notifications/notifications-provider";
import { installFakeEventSource } from "@/lib/notifications/test-event-source";
import { TopNav } from "./top-nav";

afterEach(() => vi.unstubAllGlobals());

describe("TopNav", () => {
  test("renders the three product tabs", () => {
    render(<TopNav active="homes" />);
    expect(screen.getByRole("link", { name: /homes/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /experiences/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /services/i })).toBeInTheDocument();
  });

  test("the active tab gets the ink underline class", () => {
    render(<TopNav active="experiences" />);
    const tab = screen.getByRole("link", { name: /experiences/i });
    expect(tab.className).toContain("border-ink");
  });

  test("renders the account menu button with its menu and account icons", () => {
    render(<TopNav active="homes" />);
    const button = screen.getByRole("button", { name: /account menu/i });
    expect(button.querySelectorAll("svg.lucide")).toHaveLength(2);
  });

  test("the product tabs and account area are hidden below md, and the nav is labelled", () => {
    render(<TopNav active="homes" />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.className).toContain("hidden");
    expect(nav.className).toContain("md:flex");
    expect(screen.getByRole("link", { name: "Become a host" }).className).toContain("md:block");
    expect(screen.getByRole("button", { name: /account menu/i }).closest(".hidden")?.className).toContain("md:block");
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
  });

  test("the mobile menu sits in its own labelled nav landmark, hidden from md up", () => {
    render(<TopNav active="homes" />);
    const mobileNav = screen.getByRole("navigation", { name: "Main menu" });
    expect(mobileNav.className).toContain("md:hidden");
    expect(within(mobileNav).getByRole("button", { name: "Open menu" })).toBeInTheDocument();
  });

  test("the notifications bell shows at every width, when announcements are on", () => {
    installFakeEventSource();
    render(<NotificationsProvider enabled><TopNav active="homes" /></NotificationsProvider>);

    expect(screen.getByRole("button", { name: "Notifications" }).closest(".hidden")).toBeNull();
  });

  test("the home link carries the brand mark in Rausch beside the wordmark", () => {
    render(<TopNav active="homes" />);

    const home = screen.getByRole("link", { name: "Airbnb home" });
    expect(home.querySelector("svg")).not.toBeNull();
    expect(home.className).toContain("text-rausch");
    expect(home).toHaveTextContent("airbnb");
  });
});
