import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

import TripsPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}`, name: "ana", email: "ana@example.com" });

beforeEach(() => session.requireSession.mockReset());

describe("TripsPage", () => {
  test("says there are no trips yet", async () => {
    session.requireSession.mockResolvedValue(user());
    render(await TripsPage());
    expect(session.requireSession).toHaveBeenCalledWith("/trips");
    expect(screen.getByText("No trips booked… yet!")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start searching" })).toHaveAttribute("href", "/");
  });

  test("lists an upcoming trip linking to its page", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const booking = await getRepositories().bookings.create(guest.id, {
      listingId: "l1", checkIn: "2031-07-01", checkOut: "2031-07-04", guests: { adults: 1, children: 0 },
      priceBreakdown: calculatePriceBreakdown(100, 3),
    });
    if (booking === "unavailable") throw new Error("unexpected");

    render(await TripsPage());

    expect(screen.getByRole("heading", { name: "Upcoming" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Aspen/ })).toHaveAttribute("href", `/trips/${booking.id}`);
  });
});
