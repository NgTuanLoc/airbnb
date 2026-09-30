import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import HostReservationsLoading from "./loading";

describe("HostReservationsLoading", () => {
  test("renders the main landmark with aria-busy and 4 row skeletons", () => {
    render(<HostReservationsLoading />);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("host-reservation-row-skeleton")).toHaveLength(4);
  });
});
