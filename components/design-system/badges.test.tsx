import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { NewBadge, GuestFavoriteBadge } from "./badges";

describe("badges", () => {
  test("NewBadge renders uppercase NEW with the tag type", () => {
    render(<NewBadge />);
    const el = screen.getByText("NEW");
    expect(el.className).toContain("text-uppercase-tag");
  });

  test("GuestFavoriteBadge renders the label on a shadowed pill", () => {
    render(<GuestFavoriteBadge />);
    const el = screen.getByText("Guest favorite");
    expect(el.className).toContain("rounded-full");
    expect(el.className).toContain("shadow-airbnb");
  });
});
