import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import TripLoading from "./loading";

describe("TripLoading", () => {
  test("renders the main landmark with aria-busy, one card and 3 text lines", () => {
    const { container } = render(<TripLoading />);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll(".h-64").length).toBe(1);
    expect(container.querySelectorAll(".h-4").length).toBe(3);
  });
});
