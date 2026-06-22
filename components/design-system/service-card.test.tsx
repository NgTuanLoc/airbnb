import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { ServiceCard } from "./service-card";
import type { Service } from "@/lib/types";

const service: Service = {
  id: "s1", title: "Portrait session", provider: "Mara Lensworth", serviceCategory: "Photography",
  photos: ["https://example.com/s.jpg"], price: 180, rating: 4.9, reviewCount: 10, city: "Lisbon", description: "d",
};

describe("ServiceCard", () => {
  test("renders the title, provider, and price", () => {
    render(<ServiceCard service={service} />);
    expect(screen.getByText("Portrait session")).toBeInTheDocument();
    expect(screen.getByText("Mara Lensworth")).toBeInTheDocument();
    expect(screen.getByText(/\$180/)).toBeInTheDocument();
  });

  test("uses the title-md token for the title", () => {
    render(<ServiceCard service={service} />);
    expect(screen.getByText("Portrait session").className).toContain("text-title-md");
  });
});
