import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

vi.mock("@/components/features/experience-listings", () => ({
  ExperienceListings: () => <div data-testid="experience-listings" />,
}));

import ExperiencesPage from "./page";

describe("ExperiencesPage", () => {
  test("renders the heading and the listings island", () => {
    render(<ExperiencesPage />);
    expect(screen.getByRole("heading", { name: /experiences/i })).toBeInTheDocument();
    expect(screen.getByTestId("experience-listings")).toBeInTheDocument();
  });
});
