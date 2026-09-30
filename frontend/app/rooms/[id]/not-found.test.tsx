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
