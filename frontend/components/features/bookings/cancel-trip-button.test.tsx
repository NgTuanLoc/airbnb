import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent, within } from "@/lib/test-utils";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const cancelBooking = vi.fn();
vi.mock("@/lib/api-client/availability", () => ({ cancelBooking: (id: string) => cancelBooking(id) }));

import { CancelTripButton } from "./cancel-trip-button";

beforeEach(() => {
  refresh.mockReset();
  cancelBooking.mockReset();
});

const open = () => userEvent.click(screen.getByRole("button", { name: "Cancel trip" }));

describe("CancelTripButton", () => {
  test("opens a confirmation dialog", async () => {
    render(<CancelTripButton bookingId="bk_1" />);
    await open();
    expect(screen.getByRole("dialog", { name: "Cancel this trip?" })).toBeInTheDocument();
  });

  test("keeping the trip closes the dialog without calling the API", async () => {
    render(<CancelTripButton bookingId="bk_1" />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Keep trip" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cancelBooking).not.toHaveBeenCalled();
  });

  test("confirming cancels the booking and refreshes the page", async () => {
    cancelBooking.mockResolvedValue({ id: "bk_1" });
    render(<CancelTripButton bookingId="bk_1" />);
    await open();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel trip" }));
    expect(cancelBooking).toHaveBeenCalledWith("bk_1");
    expect(refresh).toHaveBeenCalledOnce();
  });

  test("shows why a cancel failed", async () => {
    cancelBooking.mockRejectedValueOnce(new Error("This trip has already started"));
    render(<CancelTripButton bookingId="bk_1" />);
    await open();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel trip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This trip has already started");
    expect(refresh).not.toHaveBeenCalled();
  });
});
