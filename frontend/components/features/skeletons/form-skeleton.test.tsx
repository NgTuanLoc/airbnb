import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { FormSkeleton } from "./form-skeleton";

describe("FormSkeleton", () => {
  test("renders 4 labelled field blocks and a submit button block", () => {
    render(<FormSkeleton />);
    expect(screen.getAllByTestId("form-skeleton-field")).toHaveLength(4);
  });
});
