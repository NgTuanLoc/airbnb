import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import TripLoading from "./loading";

describe("TripLoading", () => {
  test("renders the main landmark with aria-busy and a detail card", () => {
    render(<TripLoading />);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });
});
