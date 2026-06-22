import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";

const useServices = vi.fn();
vi.mock("@/lib/hooks/use-services", () => ({
  useServices: (category?: string) => useServices(category),
}));

import { ServiceListings } from "./service-listings";
import type { Service } from "@/lib/types";

function make(id: string): Service {
  return { id, title: `Service ${id}`, provider: "P", serviceCategory: "Chefs", photos: ["/a.jpg"], price: 180, rating: 4.9, reviewCount: 10, city: "Rome", description: "d" };
}

describe("ServiceListings", () => {
  test("renders a card per service", () => {
    useServices.mockReturnValue({ data: [make("s1"), make("s2")], isLoading: false, isError: false });
    render(<ServiceListings />);
    expect(screen.getByText("Service s1")).toBeInTheDocument();
    expect(screen.getByText("Service s2")).toBeInTheDocument();
  });

  test("selecting a category re-queries with that category", async () => {
    useServices.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ServiceListings />);
    await userEvent.click(screen.getByRole("button", { name: "Chefs" }));
    expect(useServices).toHaveBeenLastCalledWith("Chefs");
  });

  test("shows an error state when the query fails", () => {
    useServices.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ServiceListings />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  test("shows 8 skeletons while loading", () => {
    useServices.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ServiceListings />);
    expect(screen.getAllByTestId("service-skeleton")).toHaveLength(8);
  });

  test("shows the empty state when no services are returned", () => {
    useServices.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ServiceListings />);
    expect(screen.getByText(/no services match/i)).toBeInTheDocument();
  });
});
