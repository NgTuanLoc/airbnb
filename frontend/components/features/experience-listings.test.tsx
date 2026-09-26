import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";

const useExperiences = vi.fn();
vi.mock("@/lib/hooks/use-experiences", () => ({
  useExperiences: (category?: string) => useExperiences(category),
}));

import { ExperienceListings } from "./experience-listings";
import type { Experience } from "@/lib/types";

function make(id: string): Experience {
  return { id, title: `Experience ${id}`, location: { city: "Rome", country: "Italy", lat: 1, lng: 2 }, photos: ["/a.jpg"], pricePerPerson: 65, durationHours: 3, rating: 4.9, reviewCount: 10, isNew: false, hostId: "h1", category: "Food & drink", description: "d" };
}

describe("ExperienceListings", () => {
  test("renders a card per experience", () => {
    useExperiences.mockReturnValue({ data: [make("e1"), make("e2")], isLoading: false, isError: false });
    render(<ExperienceListings />);
    expect(screen.getByText("Experience e1")).toBeInTheDocument();
    expect(screen.getByText("Experience e2")).toBeInTheDocument();
  });

  test("selecting a category re-queries with that category", async () => {
    useExperiences.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ExperienceListings />);
    await userEvent.click(screen.getByRole("button", { name: "Nature" }));
    expect(useExperiences).toHaveBeenLastCalledWith("Nature");
  });

  test("shows an error state when the query fails", () => {
    useExperiences.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ExperienceListings />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  test("shows 8 skeletons while loading", () => {
    useExperiences.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ExperienceListings />);
    expect(screen.getAllByTestId("experience-skeleton")).toHaveLength(8);
  });

  test("shows the empty state when no experiences are returned", () => {
    useExperiences.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ExperienceListings />);
    expect(screen.getByText(/no experiences match/i)).toBeInTheDocument();
  });
});
