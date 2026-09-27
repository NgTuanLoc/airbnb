import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { getRepositories } from "@/lib/repositories";

const session = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/lib/auth/get-session", () => session);

import WishlistsPage from "./page";

const user = () => ({ id: `u-${crypto.randomUUID()}`, name: "ana", email: "ana@example.com" });

beforeEach(() => session.requireSession.mockReset());

describe("WishlistsPage", () => {
  test("asks for a session that comes back to /wishlists", async () => {
    session.requireSession.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(WishlistsPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(session.requireSession).toHaveBeenCalledWith("/wishlists");
  });

  test("shows the empty state when there are no lists", async () => {
    const u = user();
    session.requireSession.mockResolvedValue(u);
    render(await WishlistsPage());
    expect(screen.getByText("Create your first wishlist")).toBeInTheDocument();
  });

  test("shows each list as a card with its count, linking to it", async () => {
    const guest = user();
    session.requireSession.mockResolvedValue(guest);
    const repos = getRepositories();
    const list = await repos.wishlists.create(guest.id, "Summer");
    await repos.wishlists.addListing(guest.id, list.id, "l1");

    render(await WishlistsPage());

    const card = screen.getByRole("link", { name: /Summer/ });
    expect(card).toHaveAttribute("href", `/wishlists/${list.id}`);
    expect(card).toHaveTextContent("1 saved");
  });
});
