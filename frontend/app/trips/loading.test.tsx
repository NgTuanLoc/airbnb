import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import TripsLoading from "./loading";

describe("TripsLoading", () => {
  test("renders the main landmark with aria-busy and 3 trip rows", () => {
    render(<TripsLoading />);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("trip-row-skeleton")).toHaveLength(3);
  });
});
