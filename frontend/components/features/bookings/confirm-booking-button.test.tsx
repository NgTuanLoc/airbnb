import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const createBooking = vi.fn();
vi.mock("@/lib/api-client/bookings", () => ({ createBooking: (input: unknown) => createBooking(input) }));

import { ConfirmBookingButton } from "./confirm-booking-button";

const request = { listingId: "l1", checkIn: "2030-01-01", checkOut: "2030-01-04", adults: 2, children: 0 };

beforeEach(() => {
  push.mockReset();
  createBooking.mockReset();
});

describe("ConfirmBookingButton", () => {
  test("creates the booking and goes to its confirmation", async () => {
    createBooking.mockResolvedValue({ id: "b1" });
    render(<ConfirmBookingButton request={request} />);

    await userEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));

    expect(createBooking).toHaveBeenCalledWith(request);
    expect(push).toHaveBeenCalledWith("/trips/b1?confirmed=1");
  });

  test("disables the button while the booking is being created", async () => {
    createBooking.mockReturnValue(new Promise(() => {}));
    render(<ConfirmBookingButton request={request} />);

    await userEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirming…" }));

    expect(screen.getByRole("button", { name: "Confirming…" })).toBeDisabled();
    expect(createBooking).toHaveBeenCalledOnce();
  });

  test("a failed booking refreshes the listing's availability", async () => {
    createBooking.mockRejectedValueOnce(new Error("Those dates were just booked. Pick different dates."));
    const { queryClient } = render(<ConfirmBookingButton request={request} />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await userEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["availability", "l1"] });
  });

  test("shows why it failed and lets the guest try again", async () => {
    createBooking.mockRejectedValueOnce(new Error("Those dates are no longer available"));
    render(<ConfirmBookingButton request={request} />);

    await userEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Those dates are no longer available");
    expect(screen.getByRole("button", { name: "Confirm and pay" })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });
});
