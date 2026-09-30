import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SessionContext, type SessionState } from "@/components/features/auth/session-provider";
import { WishlistHeartsProvider, useWishlistHearts } from "./wishlist-hearts";
import type { Listing, Wishlist } from "@/lib/types";

const api = vi.hoisted(() => ({
  fetchWishlists: vi.fn(),
  removeFromWishlists: vi.fn(),
  createWishlist: vi.fn(),
  addToWishlist: vi.fn(),
}));
vi.mock("@/lib/api-client/wishlists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client/wishlists")>()),
  ...api,
}));

const listing = { id: "l1", title: "Cozy cabin", photos: ["/a.jpg"] } as Listing;
const list = (listingIds: string[]): Wishlist => ({ id: "w1", name: "Summer", listingIds, createdAt: "2026-01-01" });

function Heart() {
  const hearts = useWishlistHearts();
  const saved = hearts?.savedIds.has(listing.id) ?? false;
  return <button onClick={() => hearts?.toggle(listing)}>{saved ? "saved" : "not saved"}</button>;
}

function renderHearts(user: SessionState["user"], redirectToLogin = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (sessionUser: SessionState["user"], ui: ReactNode) => (
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={{ user: sessionUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }}>
        <WishlistHeartsProvider redirectToLogin={redirectToLogin}>{ui}</WishlistHeartsProvider>
      </SessionContext.Provider>
    </QueryClientProvider>
  );
  const { rerender } = render(wrap(user, <Heart />));
  return { redirectToLogin, rerenderAs: (next: SessionState["user"]) => rerender(wrap(next, <Heart />)) };
}

const ana = { id: "u-ana@example.com", name: "ana", email: "ana@example.com" };
const ben = { id: "u-ben@example.com", name: "ben", email: "ben@example.com" };

beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

describe("WishlistHeartsProvider", () => {
  test("outside the provider there are no hearts", () => {
    render(<Heart />);
    expect(screen.getByRole("button")).toHaveTextContent("not saved");
  });

  test("a logged-out heart goes to login and back", async () => {
    const { redirectToLogin } = renderHearts(null);
    await userEvent.click(screen.getByRole("button"));
    expect(redirectToLogin).toHaveBeenCalledWith("/login?next=%2F");
    expect(api.fetchWishlists).not.toHaveBeenCalled();
  });

  test("a saved listing is unsaved optimistically", async () => {
    api.fetchWishlists.mockResolvedValue([list(["l1"])]);
    let finish: () => void = () => {};
    api.removeFromWishlists.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    renderHearts(ana);
    const heart = await screen.findByText("saved");

    await userEvent.click(heart);

    expect(await screen.findByText("not saved")).toBeInTheDocument();
    expect(api.removeFromWishlists).toHaveBeenCalledWith("l1");
    finish();
  });

  test("a failed unsave rolls back and says so", async () => {
    api.fetchWishlists.mockResolvedValue([list(["l1"])]);
    api.removeFromWishlists.mockRejectedValue(new Error("boom"));
    renderHearts(ana);

    await userEvent.click(await screen.findByText("saved"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't remove it from your wishlist. Try again.");
    await waitFor(() => expect(screen.getByRole("button", { name: "saved" })).toBeInTheDocument());
  });

  test("another user logging in sees their own saved listings, not the previous user's cache", async () => {
    api.fetchWishlists.mockResolvedValueOnce([list(["l1"])]).mockResolvedValueOnce([]);
    const { rerenderAs } = renderHearts(ana);
    expect(await screen.findByText("saved")).toBeInTheDocument();

    rerenderAs(ben);

    expect(await screen.findByText("not saved")).toBeInTheDocument();
    expect(api.fetchWishlists).toHaveBeenCalledTimes(2);
  });

  test("the unsave error can be dismissed with its button or Escape", async () => {
    api.fetchWishlists.mockResolvedValue([list(["l1"])]);
    api.removeFromWishlists.mockRejectedValueOnce(new Error("boom"));
    renderHearts(ana);

    await userEvent.click(await screen.findByText("saved"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    api.removeFromWishlists.mockRejectedValueOnce(new Error("boom"));
    await userEvent.click(await screen.findByText("saved"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("an unsaved listing opens the save dialog", async () => {
    api.fetchWishlists.mockResolvedValue([list([])]);
    renderHearts(ana);

    await userEvent.click(await screen.findByText("not saved"));

    expect(screen.getByRole("dialog", { name: "Save to wishlist" })).toBeInTheDocument();
  });
});
