import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { ExperienceCard } from "./experience-card";
import type { Listing } from "@/lib/types";

const exp: Listing = {
  id: "e1",
  title: "Pasta making in Rome",
  location: { city: "Rome", country: "Italy", lat: 41, lng: 12 },
  photos: ["https://example.com/e.jpg"],
  pricePerNight: 60,
  rating: 4.99,
  reviewCount: 30,
  isGuestFavorite: false,
  hostId: "h2",
  category: "Experiences",
  description: "Learn to make authentic Italian pasta.",
  propertyType: "Experience",
  maxGuests: 12,
  bedrooms: 0,
  beds: 0,
  baths: 0,
  amenities: ["Materials included", "Expert instructor"],
};

describe("ExperienceCard", () => {
  test("renders the title", () => {
    render(<ExperienceCard listing={exp} />);
    expect(screen.getByText("Pasta making in Rome")).toBeInTheDocument();
  });

  test("shows the NEW badge when isNew", () => {
    render(<ExperienceCard listing={exp} isNew />);
    expect(screen.getByText("NEW")).toBeInTheDocument();
  });

  test("photo frame uses the 4:5 aspect and md radius", () => {
    const { container } = render(<ExperienceCard listing={exp} />);
    const frame = container.querySelector("div.rounded-md");
    expect(frame?.className).toContain("aspect-[4/5]");
  });
});
