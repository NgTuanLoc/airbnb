import { describe, expect, test } from "vitest";
import { render, screen, userEvent, within } from "@/lib/test-utils";
import { ListingGallery } from "./listing-gallery";

const photos = ["/a.jpg", "/b.jpg", "/c.jpg", "/d.jpg", "/e.jpg"];

describe("ListingGallery", () => {
  test("renders an image for each photo with the listing title as alt", () => {
    render(<ListingGallery photos={photos} title="Cozy cabin" />);
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(5);
    expect(images[0]).toHaveAttribute("alt", expect.stringContaining("Cozy cabin"));
  });

  test("renders gracefully when only one photo is provided", () => {
    render(<ListingGallery photos={["/only.jpg"]} title="Solo" />);
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  test("the cover spans the full width when there is only one photo", () => {
    render(<ListingGallery photos={["/only.jpg"]} title="Solo" />);
    const cover = screen.getByRole("img").parentElement;
    expect(cover?.className).toContain("col-span-4");
    expect(cover?.className).not.toContain("col-span-2");
  });

  test("on phones the cover fills the width; from md up it shares the mosaic", () => {
    render(<ListingGallery photos={photos} title="Cozy cabin" />);
    const cover = screen.getAllByRole("img")[0].parentElement!;
    const classes = cover.className.split(" ");
    // The other photos are hidden below md, so a half-width cover would leave the right half empty.
    expect(classes).toContain("col-span-4");
    expect(classes).toContain("md:col-span-2");
    expect(screen.getAllByRole("img")[1].parentElement!.className).toContain("hidden md:block");
  });

  test("clicking a photo opens the viewer on that photo", async () => {
    render(<ListingGallery photos={photos} title="Cozy cabin" />);

    await userEvent.click(screen.getByRole("button", { name: "Open photo 3 of 5" }));

    const viewer = screen.getByRole("dialog", { name: "Photos of Cozy cabin" });
    expect(within(viewer).getByText("3 / 5")).toBeInTheDocument();
  });

  test("Show all photos opens the viewer on the first photo", async () => {
    render(<ListingGallery photos={photos} title="Cozy cabin" />);

    await userEvent.click(screen.getByRole("button", { name: "Show all photos" }));

    expect(within(screen.getByRole("dialog")).getByText("1 / 5")).toBeInTheDocument();
  });

  test("phones see how many photos there are on the cover", () => {
    render(<ListingGallery photos={photos} title="Cozy cabin" />);

    const count = screen.getByText("1 / 5");
    expect(count.className).toContain("md:hidden");
  });

  test("a single photo still opens the viewer but needs no photo count", async () => {
    render(<ListingGallery photos={["/only.jpg"]} title="Solo" />);

    expect(screen.queryByText("1 / 1")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open photo 1 of 1" }));
    expect(screen.getByRole("dialog", { name: "Photos of Solo" })).toBeInTheDocument();
  });
});
