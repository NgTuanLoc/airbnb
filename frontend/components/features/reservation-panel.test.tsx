import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent, within } from "@/lib/test-utils";
import { ReservationPanel } from "./reservation-panel";

describe("ReservationPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2031, 0, 15));
  });
  afterEach(() => vi.useRealTimers());

  const bar = () => screen.getByRole("region", { name: "Reservation summary" });

  test("the bar is mobile-only and asks for dates first", () => {
    render(<ReservationPanel listingId="l1" pricePerNight={200} maxGuests={4} query={{}} />);
    expect(bar().className).toContain("md:hidden");
    expect(within(bar()).getByText("Add dates for prices")).toBeInTheDocument();
    expect(within(bar()).getByRole("button", { name: "Check availability" })).toBeInTheDocument();
  });

  test("Check availability focuses the first open day in the card", async () => {
    render(<ReservationPanel listingId="l1" pricePerNight={200} maxGuests={4} query={{}} />);
    await userEvent.click(within(bar()).getByRole("button", { name: "Check availability" }));
    const firstOpenDay = document.querySelector<HTMLButtonElement>("#reserve [data-calendar-day]:not(:disabled)");
    expect(firstOpenDay).toHaveFocus();
  });

  test("picking dates in the card turns the bar into a Reserve link with the same href", async () => {
    render(<ReservationPanel listingId="l1" pricePerNight={200} maxGuests={4} query={{}} />);
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    const days = screen.getAllByRole("button").filter((b) => b.hasAttribute("data-calendar-day"));
    await userEvent.click(days[0]);
    await userEvent.click(days[2]);
    const links = screen.getAllByRole("link", { name: "Reserve" });
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe(links[1].getAttribute("href"));
    expect(within(bar()).getByText("Feb 1 – Feb 3")).toBeInTheDocument();
  });

  test("starts from valid query params", () => {
    render(
      <ReservationPanel listingId="l1" pricePerNight={200} maxGuests={4}
        query={{ checkIn: "2031-02-01", checkOut: "2031-02-04", adults: "2", children: "0" }} />,
    );
    expect(within(bar()).getByRole("link", { name: "Reserve" })).toHaveAttribute(
      "href", "/book/l1?checkIn=2031-02-01&checkOut=2031-02-04&adults=2&children=0",
    );
  });

  test("ignores query guests above the listing's maximum", () => {
    render(
      <ReservationPanel listingId="l1" pricePerNight={200} maxGuests={2}
        query={{ checkIn: "2031-02-01", checkOut: "2031-02-04", adults: "3", children: "1" }} />,
    );
    expect(within(bar()).getByRole("link", { name: "Reserve" }).getAttribute("href")).toContain("adults=1&children=0");
  });
});
