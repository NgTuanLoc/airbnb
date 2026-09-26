import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { DetailSkeleton } from "./detail-skeleton";

describe("DetailSkeleton", () => {
  test("renders the detail skeleton container", () => {
    render(<DetailSkeleton />);
    expect(screen.getByTestId("detail-skeleton")).toBeInTheDocument();
  });

  test("renders at least one pulsing block", () => {
    render(<DetailSkeleton />);
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });
});
