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

  test("renders the account menu button with its menu and account icons", () => {
    render(<TopNav active="homes" />);
    const button = screen.getByRole("button", { name: /account menu/i });
    expect(button.querySelectorAll("svg.lucide")).toHaveLength(2);
  });
});
