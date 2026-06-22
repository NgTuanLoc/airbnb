import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { CardGridSkeleton } from "./card-grid-skeleton";

describe("CardGridSkeleton", () => {
  test("renders the default number of card skeletons", () => {
    render(<CardGridSkeleton />);
    expect(screen.getAllByTestId("grid-card-skeleton")).toHaveLength(8);
  });

  test("renders a custom count", () => {
    render(<CardGridSkeleton count={3} />);
    expect(screen.getAllByTestId("grid-card-skeleton")).toHaveLength(3);
  });
});
