import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import EditListingLoading from "./loading";

describe("EditListingLoading", () => {
  test("renders the main landmark with aria-busy and the form skeleton", () => {
    render(<EditListingLoading />);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("form-skeleton")).toBeInTheDocument();
  });
});
