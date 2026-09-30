import { expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { SkipLink } from "./skip-link";

test("a visually hidden skip link targets #main and shows on focus", () => {
  render(<SkipLink />);
  const link = screen.getByRole("link", { name: "Skip to content" });
  expect(link).toHaveAttribute("href", "#main");
  expect(link.className).toContain("sr-only");
  expect(link.className).toContain("focus:not-sr-only");
});
