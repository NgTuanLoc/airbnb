import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { calculatePriceBreakdown } from "@/lib/reservation/pricing";
import { listings } from "@/lib/data/listings";
import { getRepositories } from "@/lib/repositories";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn() }),
}));

import BookPage from "./page";

const DAY = 86_400_000;
const daysFromToday = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const l1 = listings.find((l) => l.id === "l1")!;

function props(listingId: string, query: Record<string, string>) {
  return { params: Promise.resolve({ listingId }), searchParams: Promise.resolve(query) };
}

beforeEach(() => {
  session.requireSession.mockReset();
  session.requireSession.mockResolvedValue({ id: "u-ana@example.com", name: "ana", email: "ana@example.com" });
});

describe("BookPage", () => {
  test("shows the trip and the server-computed price", async () => {
    const query = { checkIn: daysFromToday(20), checkOut: daysFromToday(22), adults: "2", children: "0" };
    render(await BookPage(props("l1", query)));

    expect(session.requireSession).toHaveBeenCalledWith(`/book/l1?${new URLSearchParams(query)}`);
    expect(screen.getByRole("heading", { level: 1, name: "Confirm and pay" })).toBeInTheDocument();
    expect(screen.getByText("2 guests")).toBeInTheDocument();
    expect(screen.getByText(`$${calculatePriceBreakdown(l1.pricePerNight, 2).total}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm and pay" })).toBeInTheDocument();
  });

  test("invalid dates go back to the listing", async () => {
    await expect(BookPage(props("l1", { checkIn: "nope", checkOut: "nope", adults: "1" }))).rejects.toThrow("NEXT_REDIRECT");
  });

  test("more guests than the listing allows go back to the listing", async () => {
    const query = { checkIn: daysFromToday(20), checkOut: daysFromToday(22), adults: String(l1.maxGuests), children: "1" };
    await expect(BookPage(props("l1", query))).rejects.toMatchObject({ digest: expect.stringContaining("/rooms/l1") });
  });

  test("an unknown listing is not found", async () => {
    await expect(
      BookPage(props("l999", { checkIn: daysFromToday(20), checkOut: daysFromToday(22), adults: "1" })),
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  test("booking your own listing redirects back to it", async () => {
    const listing = await getRepositories().hostListings.create("u-ana@example.com", hostListingInputSchema.parse(validInput));
    await expect(
      BookPage(props(listing.id, { checkIn: daysFromToday(40), checkOut: daysFromToday(42), adults: "1" })),
    ).rejects.toThrow("NEXT_REDIRECT");
  });

  test("an unlisted listing redirects back to it", async () => {
    const hostId = `u-${crypto.randomUUID()}@example.com`;
    const repos = getRepositories();
    const listing = await repos.hostListings.create(hostId, hostListingInputSchema.parse(validInput));
    await repos.hostListings.setStatus(hostId, listing.id, "unlisted");
    await expect(
      BookPage(props(listing.id, { checkIn: daysFromToday(40), checkOut: daysFromToday(42), adults: "1" })),
    ).rejects.toThrow("NEXT_REDIRECT");
  });
});
