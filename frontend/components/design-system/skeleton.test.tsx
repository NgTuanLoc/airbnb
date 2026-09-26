import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  test("renders a pulsing surface block", () => {
    render(<Skeleton />);
    const el = screen.getByTestId("skeleton");
    expect(el.className).toContain("animate-pulse");
    expect(el.className).toContain("bg-surface-strong");
  });

  test("defaults to rounded-sm radius", () => {
    render(<Skeleton />);
    expect(screen.getByTestId("skeleton").className).toContain("rounded-sm");
  });

  test("applies the requested radius variant", () => {
    render(<Skeleton radius="full" />);
    expect(screen.getByTestId("skeleton").className).toContain("rounded-full");
  });

  test("merges a custom className for sizing", () => {
    render(<Skeleton className="h-4 w-1/2" />);
    const el = screen.getByTestId("skeleton");
    expect(el.className).toContain("h-4");
    expect(el.className).toContain("w-1/2");
  });
});
