import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import type { CardInput } from "@/lib/bookings/payment";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh }),
}));

import TripPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}`, name: "ana", email: "ana@example.com" });

// Mock mode keeps a booking paid with this card pending: nothing settles it there.
const SLOW_CARD: CardInput = { number: "4000000000000077", expMonth: 12, expYear: 2040, cvc: "123" };

async function bookFor(userId: string, checkIn: string, checkOut: string, card?: CardInput) {
  const booking = await getRepositories().bookings.create({ id: userId, name: "ana", email: "ana@example.com" }, {
    listingId: "l1", hostId: "h1", checkIn, checkOut, guests: { adults: 2, children: 0 }, priceBreakdown: calculatePriceBreakdown(100, 2),
  }, undefined, card);
  if (booking === "unavailable" || "paymentError" in booking) throw new Error("unexpected");
  return booking;
}

const props = (id: string, query: Record<string, string> = {}) => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve(query),
});

beforeEach(() => {
  session.requireSession.mockReset();
  refresh.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

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

  test("a trip whose payment is processing says so and refreshes itself", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const booking = await bookFor(guest.id, daysFromToday(60), daysFromToday(62), SLOW_CARD);

    render(await TripPage(props(booking.id)));

    expect(screen.getByRole("status")).toHaveTextContent(`Booking ${booking.id.slice(-8)} · Payment processing`);
    vi.advanceTimersByTime(3000);
    expect(refresh).toHaveBeenCalledOnce();
  });

  test("a confirmed trip doesn't refresh itself", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const booking = await bookFor(guest.id, daysFromToday(70), daysFromToday(72));

    render(await TripPage(props(booking.id)));

    vi.advanceTimersByTime(30_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  test("the host sees who booked and cannot cancel", async () => {
    const host = user();
    const guest = user();
    const booking = await getRepositories().bookings.create({ id: guest.id, name: "Gus Guest", email: "gus@example.com" }, {
      listingId: "l1", hostId: host.id, checkIn: daysFromToday(50), checkOut: daysFromToday(52), guests: { adults: 1, children: 0 },
      priceBreakdown: calculatePriceBreakdown(100, 2),
    });
    if (booking === "unavailable" || "paymentError" in booking) throw new Error("unexpected");
    session.requireSession.mockResolvedValue(host);

    render(await TripPage(props(booking.id)));

    expect(screen.getByText("Reservation by Gus Guest")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel trip" })).not.toBeInTheDocument();
  });
});
