import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { CityLinkGrid } from "./city-link-grid";
import type { City } from "@/lib/types";

const cities: City[] = [
  { id: "aspen", name: "Aspen", subLabel: "Cabin rentals", image: "https://example.com/a.jpg", listingCount: 10 },
  { id: "malibu", name: "Malibu", subLabel: "Beach house rentals", image: "https://example.com/m.jpg", listingCount: 12 },
];

describe("CityLinkGrid", () => {
  test("renders each city name and sub-label", () => {
    render(<CityLinkGrid cities={cities} />);
    expect(screen.getByText("Aspen")).toBeInTheDocument();
    expect(screen.getByText("Cabin rentals")).toBeInTheDocument();
    expect(screen.getByText("Malibu")).toBeInTheDocument();
  });

  test("city name uses the title-md token and sub-label uses muted body-sm", () => {
    render(<CityLinkGrid cities={cities} />);
    expect(screen.getByText("Aspen").className).toContain("text-title-md");
    expect(screen.getByText("Cabin rentals").className).toContain("text-muted");
  });

  test("links each city to its search page", () => {
    render(<CityLinkGrid cities={cities} />);
    expect(screen.getByRole("link", { name: /aspen/i })).toHaveAttribute("href", "/s/Aspen");
  });

  test("city links go 1 / 3 / 6 columns", () => {
    const { container } = render(<CityLinkGrid cities={cities} />);
    const firstGridElement = container.querySelector(".grid") as HTMLElement;
    expect(firstGridElement.className).toContain("grid-cols-1");
    expect(firstGridElement.className).toContain("md:grid-cols-3");
    expect(firstGridElement.className).toContain("lg:grid-cols-6");
  });
});
