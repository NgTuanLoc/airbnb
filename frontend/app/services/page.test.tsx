import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

vi.mock("@/components/features/service-listings", () => ({
  ServiceListings: () => <div data-testid="service-listings" />,
}));

import ServicesPage from "./page";

describe("ServicesPage", () => {
  test("renders the heading and the listings island", () => {
    render(<ServicesPage />);
    expect(screen.getByRole("heading", { name: /services/i })).toBeInTheDocument();
    expect(screen.getByTestId("service-listings")).toBeInTheDocument();
  });
});
