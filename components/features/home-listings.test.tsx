import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/lib/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { HomeListings } from "./home-listings";
import * as api from "@/lib/api-client/listings";
import type { Listing } from "@/lib/types";

const make = (id: string, category: string, title: string): Listing => ({
  id, title, location: { city: "Aspen", country: "USA", lat: 39, lng: -106 },
  photos: ["https://example.com/p.jpg"], pricePerNight: 200, rating: 4.9, reviewCount: 10,
  isGuestFavorite: false, hostId: "h1", category,
});

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => vi.restoreAllMocks());

describe("HomeListings", () => {
  test("renders listings from the default (All) query", async () => {
    vi.spyOn(api, "fetchListings").mockResolvedValue([make("l1", "Cabins", "Cozy cabin")]);
    renderWithClient(<HomeListings />);
    expect(await screen.findByText("Cozy cabin")).toBeInTheDocument();
  });

  test("selecting a category refetches with that category", async () => {
    const spy = vi.spyOn(api, "fetchListings").mockResolvedValue([make("l1", "Cabins", "Cozy cabin")]);
    renderWithClient(<HomeListings />);
    await screen.findByText("Cozy cabin");
    await userEvent.click(screen.getByRole("button", { name: "Beachfront" }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith("Beachfront"));
  });

  test("shows an error message when the query fails", async () => {
    vi.spyOn(api, "fetchListings").mockRejectedValue(new Error("boom"));
    renderWithClient(<HomeListings />);
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });
});
