import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { RatingDisplay } from "./rating-display";

describe("RatingDisplay", () => {
  test("formats the value to two decimals", () => {
    render(<RatingDisplay value={4.8} />);
    expect(screen.getByText("4.80")).toBeInTheDocument();
  });

  test("uses the 64px rating type in ink", () => {
    render(<RatingDisplay value={4.81} />);
    const el = screen.getByText("4.81");
    expect(el.className).toContain("text-rating");
    expect(el.className).toContain("text-ink");
  });
});
