import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

vi.mock("@/components/features/listing-gallery", () => ({
  ListingGallery: () => <div data-testid="gallery" />,
}));

import ExperienceDetailPage from "./page";

describe("ExperienceDetailPage", () => {
  test("renders the experience title and per-person price for a known id", async () => {
    const ui = await ExperienceDetailPage({ params: Promise.resolve({ id: "e1" }) });
    render(ui);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/per person/i)).toBeInTheDocument();
  });
});
