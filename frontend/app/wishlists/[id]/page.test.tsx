import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

import WishlistPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}`, name: "ana", email: "ana@example.com" });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => session.requireSession.mockReset());

describe("WishlistPage", () => {
  test("shows the list's name and its listings, skipping ones that no longer exist", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const repos = getRepositories();
    const list = await repos.wishlists.create(guest.id, "Cabins");
    await repos.wishlists.addListing(guest.id, list.id, "l1");
    await repos.wishlists.addListing(guest.id, list.id, "l-gone");

    render(await WishlistPage(params(list.id)));

    expect(session.requireSession).toHaveBeenCalledWith(`/wishlists/${list.id}`);
    expect(screen.getByRole("heading", { level: 1, name: "Cabins" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /cozy cabin in the pines/i })).toHaveAttribute("href", "/rooms/l1");
  });

  test("another user's wishlist is not found", async () => {
    const owner = user();
    const list = await getRepositories().wishlists.create(owner.id, "Private");
    session.requireSession.mockResolvedValue(user());

    await expect(WishlistPage(params(list.id))).rejects.toThrow();
  });

  test("an empty list says so", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const list = await getRepositories().wishlists.create(guest.id, "Empty");

    render(await WishlistPage(params(list.id)));

    expect(screen.getByText("Nothing saved yet")).toBeInTheDocument();
  });
});
