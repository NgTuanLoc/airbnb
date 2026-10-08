import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";

const session = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

vi.mock("@/lib/api-client/availability", () => ({ fetchAvailability: () => Promise.resolve([]) }));

import RoomPage from "./page";

beforeEach(() => session.getSession.mockResolvedValue(null));

describe("RoomPage", () => {
  test("renders the listing title, gallery, amenities, and reservation card for a known id", async () => {
    const ui = await RoomPage({ params: Promise.resolve({ id: "l1" }), searchParams: Promise.resolve({}) });
    render(ui);
    expect(screen.getByRole("heading", { level: 1, name: /cozy cabin in the pines/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /what this place offers/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reserve$/i })).toBeInTheDocument();
  });

  test("calls notFound for an unknown id", async () => {
    await expect(
      RoomPage({ params: Promise.resolve({ id: "does-not-exist" }), searchParams: Promise.resolve({}) }),
    ).rejects.toThrow();
  });

  test("a host listing shows its host and 'New' instead of a rating", async () => {
    const host = { id: `u-${crypto.randomUUID()}@example.com`, name: "Ana", email: "ana@example.com" };
    const repos = getRepositories();
    await repos.hostProfiles.upsertFromUser(host);
    const listing = await repos.hostListings.create(host.id, hostListingInputSchema.parse(validInput));

    render(await RoomPage({ params: Promise.resolve({ id: listing.id }), searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { level: 1, name: "Sunny cabin by the lake" })).toBeInTheDocument();
    expect(screen.getAllByText(/New/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reserve$/i })).toBeInTheDocument();
  });

  test("the owner sees manage links instead of the reservation card", async () => {
    const host = { id: `u-${crypto.randomUUID()}@example.com`, name: "Ana", email: "ana@example.com" };
    const listing = await getRepositories().hostListings.create(host.id, hostListingInputSchema.parse(validInput));
    session.getSession.mockResolvedValue(host);

    render(await RoomPage({ params: Promise.resolve({ id: listing.id }), searchParams: Promise.resolve({}) }));

    expect(screen.getByText("This is your listing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit listing" })).toHaveAttribute("href", `/host/listings/${listing.id}/edit`);
    expect(screen.queryByRole("button", { name: /^reserve$/i })).not.toBeInTheDocument();
  });

  test("an unlisted listing shows a notice to guests", async () => {
    const hostId = `u-${crypto.randomUUID()}@example.com`;
    const repos = getRepositories();
    const listing = await repos.hostListings.create(hostId, hostListingInputSchema.parse(validInput));
    await repos.hostListings.setStatus(hostId, listing.id, "unlisted");

    render(await RoomPage({ params: Promise.resolve({ id: listing.id }), searchParams: Promise.resolve({}) }));

    expect(screen.getByText("This place isn't taking bookings right now")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^reserve$/i })).not.toBeInTheDocument();
  });

  test("the reviews band says Guest favorite only for guest favorites", async () => {
    // l3 is a seed listing with isGuestFavorite false and reviewCount > 0.
    render(await RoomPage({ params: Promise.resolve({ id: "l3" }), searchParams: Promise.resolve({}) }));

    expect(screen.getByText(/^\d+ reviews$/)).toBeInTheDocument();
    expect(screen.queryByText(/Guest favorite ·/)).not.toBeInTheDocument();
  });

  test("guests get the mobile reservation bar and bottom padding for it", async () => {
    session.getSession.mockResolvedValue(null);
    const { container } = render(await RoomPage({ params: Promise.resolve({ id: "l1" }), searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("region", { name: "Reservation summary" })).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain("pb-24");
  });

  test("the owner sees no reservation bar", async () => {
    const host = { id: `u-${crypto.randomUUID()}@example.com`, name: "Ana", email: "ana@example.com" };
    const listing = await getRepositories().hostListings.create(host.id, hostListingInputSchema.parse(validInput));
    session.getSession.mockResolvedValue(host);

    render(await RoomPage({ params: Promise.resolve({ id: listing.id }), searchParams: Promise.resolve({}) }));

    expect(screen.queryByRole("region", { name: "Reservation summary" })).not.toBeInTheDocument();
  });

  describe("with dates parsed once on the server", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2031, 0, 15));
    });
    afterEach(() => vi.useRealTimers());

    test("valid future dates in searchParams carry through to the Reserve link", async () => {
      const searchParams = Promise.resolve({ checkIn: "2031-02-01", checkOut: "2031-02-04", adults: "2", children: "0" });
      render(await RoomPage({ params: Promise.resolve({ id: "l1" }), searchParams }));

      const bar = screen.getByRole("region", { name: "Reservation summary" });
      expect(within(bar).getByRole("link", { name: "Reserve" })).toHaveAttribute(
        "href", "/book/l1?checkIn=2031-02-01&checkOut=2031-02-04&adults=2&children=0",
      );
    });

    test("past dates in searchParams fall back to Check availability", async () => {
      const searchParams = Promise.resolve({ checkIn: "2031-01-10", checkOut: "2031-01-12" });
      render(await RoomPage({ params: Promise.resolve({ id: "l1" }), searchParams }));

      const bar = screen.getByRole("region", { name: "Reservation summary" });
      expect(within(bar).getByRole("button", { name: "Check availability" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Reserve" })).not.toBeInTheDocument();
    });
  });
});
