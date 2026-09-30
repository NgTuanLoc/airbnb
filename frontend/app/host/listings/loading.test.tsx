import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import HostListingsLoading from "./loading";

describe("HostListingsLoading", () => {
  test("renders the main landmark with aria-busy and 3 listing rows", () => {
    render(<HostListingsLoading />);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("host-listing-row-skeleton")).toHaveLength(3);
  });
});
