import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListingGallery } from "./listing-gallery";

const photos = ["/a.jpg", "/b.jpg", "/c.jpg", "/d.jpg", "/e.jpg"];

describe("ListingGallery", () => {
  test("renders an image for each photo with the listing title as alt", () => {
    render(<ListingGallery photos={photos} title="Cozy cabin" />);
    const images = screen.getAllByRole("img");
    expect(images.length).toBe(5);
    expect(images[0]).toHaveAttribute("alt", expect.stringContaining("Cozy cabin"));
  });

  test("renders gracefully when only one photo is provided", () => {
    render(<ListingGallery photos={["/only.jpg"]} title="Solo" />);
    expect(screen.getAllByRole("img").length).toBe(1);
  });

  test("the cover spans the full width when there is only one photo", () => {
    render(<ListingGallery photos={["/only.jpg"]} title="Solo" />);
    const cover = screen.getByRole("img").parentElement;
    expect(cover?.className).toContain("col-span-4");
    expect(cover?.className).not.toContain("col-span-2");
  });
});
