import { expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import ListingNotFound from "./not-found";

test("offers one link home, not a button nested in a link", () => {
  render(<ListingNotFound />);
  const link = screen.getByRole("link", { name: "Back to home" });
  expect(link).toHaveAttribute("href", "/");
  expect(link.querySelector("button")).toBeNull();
  expect(link.className).toContain("bg-rausch");
});

test("keeps the tablet gutter on the main wrapper", () => {
  render(<ListingNotFound />);
  const main = screen.getByRole("main");
  expect(main.className).toContain("md:px-10");
});
