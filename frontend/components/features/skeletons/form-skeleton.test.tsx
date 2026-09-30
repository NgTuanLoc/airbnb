import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { FormSkeleton } from "./form-skeleton";

describe("FormSkeleton", () => {
  test("renders 4 labelled field blocks and a submit button block", () => {
    render(<FormSkeleton />);
    expect(screen.getAllByTestId("form-skeleton-field")).toHaveLength(4);
  });

  test("matches the host form's max-w-[720px] wrapper so the width doesn't jump on swap", () => {
    render(<FormSkeleton />);
    expect(screen.getByTestId("form-skeleton").className).toContain("max-w-[720px]");
  });
});
