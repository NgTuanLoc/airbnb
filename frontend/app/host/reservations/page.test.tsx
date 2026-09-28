import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

import HostReservationsPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}@example.com`, name: "ana", email: "ana@example.com" });

beforeEach(() => session.requireSession.mockReset());

describe("HostReservationsPage", () => {
  test("says when there are none", async () => {
    session.requireSession.mockResolvedValue(user());
    render(await HostReservationsPage());
    expect(session.requireSession).toHaveBeenCalledWith("/host/reservations");
    expect(screen.getByText("No reservations yet")).toBeInTheDocument();
  });

  test("lists reservations on the host's listings, including unlisted ones", async () => {
    const host = user();
    session.requireSession.mockResolvedValue(host);
    const repos = getRepositories();
    const listing = await repos.hostListings.create(host.id, hostListingInputSchema.parse(validInput));
    const guestEmail = `guest-${crypto.randomUUID()}@example.com`;
    await repos.bookings.create(`u-${guestEmail}`, {
      listingId: listing.id, checkIn: "2033-03-01", checkOut: "2033-03-04", guests: { adults: 2, children: 0 },
      priceBreakdown: calculatePriceBreakdown(180, 3),
    });
    await repos.hostListings.setStatus(host.id, listing.id, "unlisted");

    render(await HostReservationsPage());

    expect(screen.getByRole("heading", { name: "Upcoming" })).toBeInTheDocument();
    expect(screen.getByText("Sunny cabin by the lake")).toBeInTheDocument();
    expect(screen.getByText(guestEmail)).toBeInTheDocument();
    expect(screen.getByText("Mar 1, 2033 – Mar 4, 2033")).toBeInTheDocument();
  });
});
