import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { getRepositories } from "@/lib/repositories";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";

const session = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

import RoomPage from "./page";

beforeEach(() => session.getSession.mockResolvedValue(null));

describe("RoomPage", () => {
  test("renders the listing title, gallery, amenities, and reservation card for a known id", async () => {
    const ui = await RoomPage({ params: Promise.resolve({ id: "l1" }) });
    render(ui);
    expect(screen.getByRole("heading", { level: 1, name: /cozy cabin in the pines/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /what this place offers/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reserve$/i })).toBeInTheDocument();
  });

  test("calls notFound for an unknown id", async () => {
    await expect(RoomPage({ params: Promise.resolve({ id: "does-not-exist" }) })).rejects.toThrow();
  });

  test("a host listing shows its host and 'New' instead of a rating", async () => {
    const host = { id: `u-${crypto.randomUUID()}@example.com`, name: "Ana", email: "ana@example.com" };
    const repos = getRepositories();
    await repos.hostProfiles.upsertFromUser(host);
    const listing = await repos.hostListings.create(host.id, hostListingInputSchema.parse(validInput));

    render(await RoomPage({ params: Promise.resolve({ id: listing.id }) }));

    expect(screen.getByRole("heading", { level: 1, name: "Sunny cabin by the lake" })).toBeInTheDocument();
    expect(screen.getAllByText(/New/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^reserve$/i })).toBeInTheDocument();
  });

  test("the owner sees manage links instead of the reservation card", async () => {
    const host = { id: `u-${crypto.randomUUID()}@example.com`, name: "Ana", email: "ana@example.com" };
    const listing = await getRepositories().hostListings.create(host.id, hostListingInputSchema.parse(validInput));
    session.getSession.mockResolvedValue(host);

    render(await RoomPage({ params: Promise.resolve({ id: listing.id }) }));

    expect(screen.getByText("This is your listing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit listing" })).toHaveAttribute("href", `/host/listings/${listing.id}/edit`);
    expect(screen.queryByRole("button", { name: /^reserve$/i })).not.toBeInTheDocument();
  });

  test("an unlisted listing shows a notice to guests", async () => {
    const hostId = `u-${crypto.randomUUID()}@example.com`;
    const repos = getRepositories();
    const listing = await repos.hostListings.create(hostId, hostListingInputSchema.parse(validInput));
    await repos.hostListings.setStatus(hostId, listing.id, "unlisted");

    render(await RoomPage({ params: Promise.resolve({ id: listing.id }) }));

    expect(screen.getByText("This place isn't taking bookings right now")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^reserve$/i })).not.toBeInTheDocument();
  });
});
