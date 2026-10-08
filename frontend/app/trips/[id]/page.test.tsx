import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

import TripPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}`, name: "ana", email: "ana@example.com" });

async function bookFor(userId: string, checkIn: string, checkOut: string) {
  const booking = await getRepositories().bookings.create({ id: userId, name: "ana", email: "ana@example.com" }, {
    listingId: "l1", hostId: "h1", checkIn, checkOut, guests: { adults: 2, children: 0 }, priceBreakdown: calculatePriceBreakdown(100, 2),
  });
  if (booking === "unavailable") throw new Error("unexpected");
  return booking;
}

const props = (id: string, query: Record<string, string> = {}) => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve(query),
});

beforeEach(() => session.requireSession.mockReset());

describe("TripPage", () => {
  test("celebrates a fresh booking and shows its details", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const booking = await bookFor(guest.id, "2032-01-10", "2032-01-12");

    render(await TripPage(props(booking.id, { confirmed: "1" })));

    expect(session.requireSession).toHaveBeenCalledWith(`/trips/${booking.id}`);
    expect(screen.getByText("You're going to Aspen!")).toBeInTheDocument();
    expect(screen.getByText("Jan 10, 2032 – Jan 12, 2032")).toBeInTheDocument();
    expect(screen.getByText(`$${booking.priceBreakdown.total}`)).toBeInTheDocument();
  });

  test("another user's trip is not found", async () => {
    const booking = await bookFor(user().id, "2032-02-10", "2032-02-12");
    session.requireSession.mockResolvedValue(user());
    await expect(TripPage(props(booking.id))).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  const today = () => new Date().toISOString().slice(0, 10);
  const daysFromToday = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  test("a confirmed future trip can be cancelled, and reads Confirmed", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const booking = await bookFor(guest.id, daysFromToday(30), daysFromToday(32));

    render(await TripPage(props(booking.id)));

    expect(screen.getByRole("button", { name: "Cancel trip" })).toBeInTheDocument();
    expect(screen.getByText(`Booking ${booking.id.slice(-8)} · Confirmed`)).toBeInTheDocument();
  });

  test("a cancelled trip says Cancelled and has no cancel button", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const booking = await bookFor(guest.id, daysFromToday(40), daysFromToday(42));
    await getRepositories().bookings.cancel(guest.id, booking.id);

    render(await TripPage(props(booking.id)));

    expect(screen.getByText(`Booking ${booking.id.slice(-8)} · Cancelled`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel trip" })).not.toBeInTheDocument();
  });

  test("a trip whose check-in has come has no cancel button", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const booking = await bookFor(guest.id, today(), daysFromToday(2));

    render(await TripPage(props(booking.id)));

    expect(screen.queryByRole("button", { name: "Cancel trip" })).not.toBeInTheDocument();
  });

  test("the host sees who booked and cannot cancel", async () => {
    const host = user();
    const guest = user();
    const booking = await getRepositories().bookings.create({ id: guest.id, name: "Gus Guest", email: "gus@example.com" }, {
      listingId: "l1", hostId: host.id, checkIn: daysFromToday(50), checkOut: daysFromToday(52), guests: { adults: 1, children: 0 },
      priceBreakdown: calculatePriceBreakdown(100, 2),
    });
    if (booking === "unavailable") throw new Error("unexpected");
    session.requireSession.mockResolvedValue(host);

    render(await TripPage(props(booking.id)));

    expect(screen.getByText("Reservation by Gus Guest")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel trip" })).not.toBeInTheDocument();
  });
});
