import { describe, expect, test } from "vitest";
import { render, screen, within } from "@/lib/test-utils";
import { TopNav } from "./top-nav";

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
    expect(screen.getByRole("link", { name: "Become a host" }).parentElement?.className).toContain("md:flex");
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
  });

  test("the mobile menu sits in its own labelled nav landmark, hidden from md up", () => {
    render(<TopNav active="homes" />);
    const mobileNav = screen.getByRole("navigation", { name: "Main menu" });
    expect(mobileNav.className).toContain("md:hidden");
    expect(within(mobileNav).getByRole("button", { name: "Open menu" })).toBeInTheDocument();
  });
});
