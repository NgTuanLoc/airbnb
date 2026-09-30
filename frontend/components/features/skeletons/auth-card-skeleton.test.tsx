import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { AuthCardSkeleton } from "./auth-card-skeleton";

describe("AuthCardSkeleton", () => {
  test("renders the busy card with field and button skeletons", () => {
    render(<AuthCardSkeleton />);
    const card = screen.getByTestId("auth-card-skeleton");
    expect(card).toHaveAttribute("aria-busy", "true");
    expect(card).toHaveAttribute("aria-label", "Loading page");
    expect(card.className).toContain("max-w-md");
  });
});
