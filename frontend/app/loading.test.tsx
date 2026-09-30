import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import RootLoading from "./loading";

describe("RootLoading", () => {
  test("renders the main landmark with aria-busy and a card grid", () => {
    render(<RootLoading />);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("grid-card-skeleton").length).toBeGreaterThan(0);
  });
});
