import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import BookLoading from "./loading";

describe("BookLoading", () => {
  test("renders the main landmark with aria-busy and the two-column grid", () => {
    render(<BookLoading />);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });
});
