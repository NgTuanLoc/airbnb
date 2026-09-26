import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewsGrid } from "./reviews-grid";
import type { Review } from "@/lib/types";

const reviews: Review[] = [
  { id: "r1", listingId: "l1", authorName: "Sarah", authorAvatar: "/s.jpg", date: "March 2026", rating: 5, body: "Lovely stay." },
  { id: "r2", listingId: "l1", authorName: "David", authorAvatar: "/d.jpg", date: "Feb 2026", rating: 5, body: "Great place." },
];

describe("ReviewsGrid", () => {
  test("renders an excerpt card per review with author and body", () => {
    render(<ReviewsGrid reviews={reviews} />);
    expect(screen.getByText("Sarah")).toBeInTheDocument();
    expect(screen.getByText("Lovely stay.")).toBeInTheDocument();
    expect(screen.getByText("David")).toBeInTheDocument();
  });

  test("renders an empty-state message when there are no reviews", () => {
    render(<ReviewsGrid reviews={[]} />);
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
  });
});
