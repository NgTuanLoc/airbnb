import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SaveToWishlistDialog } from "./save-to-wishlist-dialog";
import type { Listing, Wishlist } from "@/lib/types";

const api = vi.hoisted(() => ({ createWishlist: vi.fn(), addToWishlist: vi.fn() }));
vi.mock("@/lib/api-client/wishlists", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client/wishlists")>()),
  ...api,
}));

const listing = { id: "l7", title: "Beach house", photos: ["/b.jpg"] } as Listing;
const summer: Wishlist = { id: "w1", name: "Summer", listingIds: ["l1", "l2"], createdAt: "2026-01-01" };

function renderDialog(wishlists: Wishlist[], onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <SaveToWishlistDialog listing={listing} wishlists={wishlists} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, unmount };
}

beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

describe("SaveToWishlistDialog", () => {
  test("lists the guest's wishlists with their counts and saves to the one picked", async () => {
    api.addToWishlist.mockResolvedValue({ ...summer, listingIds: [...summer.listingIds, "l7"] });
    const { onClose } = renderDialog([summer]);

    await userEvent.click(screen.getByRole("button", { name: /Summer.*2 saved/ }));

    expect(api.addToWishlist).toHaveBeenCalledWith("w1", "l7");
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test("with no lists yet it asks for a name straight away", () => {
    renderDialog([]);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  test("creates a new wishlist with the listing", async () => {
    api.createWishlist.mockResolvedValue({ ...summer, id: "w2", name: "Beach", listingIds: ["l7"] });
    const { onClose } = renderDialog([summer]);

    await userEvent.click(screen.getByRole("button", { name: "Create new wishlist" }));
    await userEvent.type(screen.getByLabelText("Name"), "  Beach  ");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(api.createWishlist).toHaveBeenCalledWith({ name: "Beach", listingId: "l7" });
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test("an empty name is refused before calling the API", async () => {
    renderDialog([]);
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByText("Give your wishlist a name")).toBeInTheDocument();
    expect(api.createWishlist).not.toHaveBeenCalled();
  });

  test("shows an API failure inline and stays open", async () => {
    api.addToWishlist.mockRejectedValue(new Error("Wishlist not found"));
    const { onClose } = renderDialog([summer]);

    await userEvent.click(screen.getByRole("button", { name: /Summer/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Wishlist not found");
    expect(onClose).not.toHaveBeenCalled();
  });

  test("the close button closes it", async () => {
    const { onClose } = renderDialog([summer]);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  test("Cancel forgets the typed name, so reopening the form starts empty", async () => {
    renderDialog([summer]);

    await userEvent.click(screen.getByRole("button", { name: "Create new wishlist" }));
    await userEvent.type(screen.getByLabelText("Name"), "Beach");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Create new wishlist" }));

    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  test("focus goes back to what opened it once it closes", () => {
    const opener = document.body.appendChild(document.createElement("button"));
    opener.focus();
    const { unmount } = renderDialog([summer]);
    screen.getByRole("button", { name: "Close" }).focus(); // a real showModal moves focus inside; the jsdom polyfill doesn't

    unmount();

    expect(opener).toHaveFocus();
    opener.remove();
  });
});
