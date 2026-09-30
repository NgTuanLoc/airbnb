import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";
import { hostListingInputSchema } from "@/lib/host/schemas";
import { validInput } from "@/lib/host/test-fixtures";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import HostListingsPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}@example.com`, name: "ana", email: "ana@example.com" });
const props = (query: Record<string, string> = {}) => ({ searchParams: Promise.resolve(query) });

beforeEach(() => session.requireSession.mockReset());

describe("HostListingsPage", () => {
  test("is gated and invites a new host to create a listing", async () => {
    session.requireSession.mockResolvedValue(user());
    render(await HostListingsPage(props()));
    expect(session.requireSession).toHaveBeenCalledWith("/host/listings");
    expect(screen.getByText("You don't have any listings yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a listing" })).toHaveAttribute("href", "/host/listings/new");
  });

  test("lists the host's listings with status and actions, and celebrates a new one", async () => {
    const host = user();
    session.requireSession.mockResolvedValue(host);
    const listing = await getRepositories().hostListings.create(host.id, hostListingInputSchema.parse(validInput));

    render(await HostListingsPage(props({ created: listing.id })));

    expect(screen.getByText("Your listing is live")).toBeInTheDocument();
    expect(screen.getByText("Sunny cabin by the lake")).toBeInTheDocument();
    expect(screen.getByText("Listed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute("href", `/host/listings/${listing.id}/edit`);
    expect(screen.getByRole("button", { name: "Unlist" })).toBeInTheDocument();
  });

  test("stacks each row's details and actions below the actions row on phones", async () => {
    const host = user();
    session.requireSession.mockResolvedValue(host);
    await getRepositories().hostListings.create(host.id, hostListingInputSchema.parse(validInput));

    render(await HostListingsPage(props()));

    const row = screen.getByRole("listitem");
    expect(row.className).toContain("flex-col");
    expect(row.className).toContain("md:flex-row");
  });
});
