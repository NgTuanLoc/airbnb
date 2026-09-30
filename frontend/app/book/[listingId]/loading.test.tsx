import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import BookLoading from "./loading";

describe("BookLoading", () => {
  test("renders the main landmark with aria-busy and the two-column grid", () => {
    const { container } = render(<BookLoading />);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll(".h-24").length).toBe(3);
    expect(container.querySelectorAll(".h-80").length).toBe(1);
  });
});
