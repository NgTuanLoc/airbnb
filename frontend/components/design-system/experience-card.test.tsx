import { describe, expect, test } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { ExperienceCard } from "./experience-card";
import type { Experience } from "@/lib/types";

const exp: Experience = {
  id: "e1", title: "Pasta with a nonna",
  location: { city: "Rome", country: "Italy", lat: 1, lng: 2 },
  photos: ["https://example.com/e.jpg"], pricePerPerson: 65, durationHours: 3,
  rating: 4.9, reviewCount: 10, isNew: false, hostId: "h1", category: "Food & drink", description: "d",
};

describe("ExperienceCard", () => {
  test("renders the title and per-person price", () => {
    render(<ExperienceCard experience={exp} />);
    expect(screen.getByText("Pasta with a nonna")).toBeInTheDocument();
    expect(screen.getByText(/\$65 \/ person/i)).toBeInTheDocument();
  });

  test("shows the New badge when the experience is new", () => {
    render(<ExperienceCard experience={{ ...exp, isNew: true }} />);
    expect(screen.getByText(/new/i)).toBeInTheDocument();
  });

  test("uses the title-md token for the title", () => {
    render(<ExperienceCard experience={exp} />);
    expect(screen.getByText("Pasta with a nonna").className).toContain("text-title-md");
  });

  test("the photo zooms on hover without resizing the card", () => {
    render(<ExperienceCard experience={exp} />);
    const img = screen.getByRole("img", { name: exp.title });
    expect(img.className).toContain("group-hover:scale-105");
    expect(img.className).toContain("transition-transform");
  });
});
