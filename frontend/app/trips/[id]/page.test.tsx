import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

import TripPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}`, name: "ana", email: "ana@example.com" });

async function bookFor(userId: string, checkIn: string, checkOut: string) {
  const booking = await getRepositories().bookings.create(userId, {
    listingId: "l1", checkIn, checkOut, guests: { adults: 2, children: 0 }, priceBreakdown: calculatePriceBreakdown(100, 2),
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
});
