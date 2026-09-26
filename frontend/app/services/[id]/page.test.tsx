import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

vi.mock("@/components/features/listing-gallery", () => ({
  ListingGallery: () => <div data-testid="gallery" />,
}));

import ServiceDetailPage from "./page";

describe("ServiceDetailPage", () => {
  test("renders the service title and provider for a known id", async () => {
    const ui = await ServiceDetailPage({ params: Promise.resolve({ id: "s1" }) });
    render(ui);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Mara Lensworth/)).toBeInTheDocument();
  });
});
