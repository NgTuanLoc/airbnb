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
    const booking = await getRepositories().bookings.create({ id: guest.id, name: guest.name, email: guest.email }, {
      listingId: "l1", hostId: "h1", checkIn: "2031-07-01", checkOut: "2031-07-04", guests: { adults: 1, children: 0 },
      priceBreakdown: calculatePriceBreakdown(100, 3),
    });
    if (booking === "unavailable") throw new Error("unexpected");

    render(await TripsPage());

    expect(screen.getByRole("heading", { name: "Upcoming" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Aspen/ })).toHaveAttribute("href", `/trips/${booking.id}`);
  });

  const bookTrip = async (guest: ReturnType<typeof user>, checkIn: string, checkOut: string) => {
    const booking = await getRepositories().bookings.create({ id: guest.id, name: guest.name, email: guest.email }, {
      listingId: "l1", hostId: "h1", checkIn, checkOut, guests: { adults: 1, children: 0 }, priceBreakdown: calculatePriceBreakdown(100, 3),
    });
    if (booking === "unavailable") throw new Error("unexpected");
    return booking;
  };

  test("shows a cancelled trip under Cancelled with a badge, not under Upcoming", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const kept = await bookTrip(guest, "2031-09-01", "2031-09-04");
    const dropped = await bookTrip(guest, "2031-10-01", "2031-10-04");
    await getRepositories().bookings.cancel(guest.id, dropped.id);

    render(await TripsPage());

    expect(screen.getByRole("heading", { name: "Upcoming" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cancelled" })).toBeInTheDocument();
    expect(screen.getAllByText("Cancelled")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Oct 1, 2031/ })).toHaveTextContent("Cancelled");
    expect(screen.getByRole("link", { name: /Sep 1, 2031/ })).not.toHaveTextContent("Cancelled");
    expect(kept.id).not.toBe(dropped.id);
  });

  test("a guest whose trips are all cancelled still sees the Cancelled section", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const only = await bookTrip(guest, "2031-11-01", "2031-11-04");
    await getRepositories().bookings.cancel(guest.id, only.id);

    render(await TripsPage());

    expect(screen.getByRole("heading", { name: "Cancelled" })).toBeInTheDocument();
    expect(screen.queryByText("No trips booked… yet!")).not.toBeInTheDocument();
  });
});
