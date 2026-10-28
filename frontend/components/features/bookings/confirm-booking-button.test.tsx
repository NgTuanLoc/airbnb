import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const createBooking = vi.fn();
vi.mock("@/lib/api-client/bookings", () => ({ createBooking: (input: unknown) => createBooking(input) }));

import { ConfirmBookingButton } from "./confirm-booking-button";

const request = { listingId: "l1", checkIn: "2030-01-01", checkOut: "2030-01-04", adults: 2, children: 0 };

async function fillCard(number = "4242 4242 4242 4242", expiry = "12/30", cvc = "123") {
  await userEvent.type(screen.getByLabelText("Card number"), number);
  await userEvent.type(screen.getByLabelText("Expiry (MM/YY)"), expiry);
  await userEvent.type(screen.getByLabelText("CVC"), cvc);
}

beforeEach(() => {
  push.mockReset();
  createBooking.mockReset();
});

describe("ConfirmBookingButton", () => {
  test("sends the card with the booking and goes to its confirmation", async () => {
    createBooking.mockResolvedValue({ id: "b1", status: "confirmed" });
    render(<ConfirmBookingButton request={request} />);

    await fillCard();
    await userEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));

    expect(createBooking).toHaveBeenCalledWith({
      ...request,
      card: { number: "4242 4242 4242 4242", expMonth: 12, expYear: 2030, cvc: "123" },
    });
    expect(push).toHaveBeenCalledWith("/trips/b1?confirmed=1");
  });

  test("a payment still processing goes to the trip without the celebration", async () => {
    createBooking.mockResolvedValue({ id: "b2", status: "pending" });
    render(<ConfirmBookingButton request={request} />);

    await fillCard("4000 0000 0000 0077");
    await userEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));

    expect(push).toHaveBeenCalledWith("/trips/b2");
  });

  test("lists the test cards", () => {
    render(<ConfirmBookingButton request={request} />);

    expect(screen.getByText(/4242 4242 4242 4242/)).toBeInTheDocument();
    expect(screen.getByText(/4000 0000 0000 0002/)).toBeInTheDocument();
  });

  test("a malformed expiry is caught before booking", async () => {
    render(<ConfirmBookingButton request={request} />);

    await fillCard(undefined, "1230");
    await userEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the expiry as MM/YY");
    expect(createBooking).not.toHaveBeenCalled();
  });

  test("disables the button while the booking is being created", async () => {
    createBooking.mockReturnValue(new Promise(() => {}));
    render(<ConfirmBookingButton request={request} />);

    await fillCard();
    await userEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirming…" }));

    expect(screen.getByRole("button", { name: "Confirming…" })).toBeDisabled();
    expect(createBooking).toHaveBeenCalledOnce();
  });

  test("a failed booking refreshes the listing's availability", async () => {
    createBooking.mockRejectedValueOnce(new Error("Those dates were just booked. Pick different dates."));
    const { queryClient } = render(<ConfirmBookingButton request={request} />);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await fillCard();
    await userEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["availability", "l1"] });
  });

  test("shows why the payment failed and lets the guest try again", async () => {
    createBooking.mockRejectedValueOnce(new Error("Your card was declined"));
    render(<ConfirmBookingButton request={request} />);

    await fillCard("4000 0000 0000 0002");
    await userEvent.click(screen.getByRole("button", { name: "Confirm and pay" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your card was declined");
    expect(screen.getByRole("button", { name: "Confirm and pay" })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });
});
