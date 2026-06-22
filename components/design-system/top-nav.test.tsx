import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
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

  test("renders the account menu link", () => {
    render(<TopNav active="homes" />);
    expect(screen.getByRole("link", { name: /account menu/i })).toBeInTheDocument();
  });

  test("renders menu and account icons inside the account link", () => {
    render(<TopNav active="homes" />);
    const link = screen.getByRole("link", { name: /account menu/i });
    expect(link.querySelectorAll("svg.lucide")).toHaveLength(2);
  });

  test("the account control links to the login page", () => {
    render(<TopNav active="homes" />);
    const account = screen.getByRole("link", { name: "Account menu" });
    expect(account).toHaveAttribute("href", "/login");
  });
});
