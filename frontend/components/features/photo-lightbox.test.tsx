import { describe, expect, test, vi } from "vitest";
import { render, screen, userEvent, within } from "@/lib/test-utils";
import { PhotoLightbox } from "./photo-lightbox";

const photos = ["/a.jpg", "/b.jpg", "/c.jpg"];

function open(startIndex = 0, onClose = vi.fn()) {
  render(<PhotoLightbox photos={photos} title="Cozy cabin" startIndex={startIndex} onClose={onClose} />);
  return { dialog: screen.getByRole("dialog", { name: "Photos of Cozy cabin" }), onClose };
}

describe("PhotoLightbox", () => {
  test("shows every photo whole, starting from the one that was clicked", () => {
    const { dialog } = open(1);

    expect(within(dialog).getAllByRole("img")).toHaveLength(3);
    expect(within(dialog).getAllByRole("img")[0].className).toContain("object-contain");
    expect(within(dialog).getByText("2 / 3")).toBeInTheDocument();
  });

  test("next and previous buttons move between photos and stop at the ends", async () => {
    const { dialog } = open(0);
    const previous = within(dialog).getByRole("button", { name: "Previous photo" });
    const next = within(dialog).getByRole("button", { name: "Next photo" });

    expect(previous).toBeDisabled();
    await userEvent.click(next);
    await userEvent.click(next);
    expect(within(dialog).getByText("3 / 3")).toBeInTheDocument();
    expect(next).toBeDisabled();
    await userEvent.click(previous);
    expect(within(dialog).getByText("2 / 3")).toBeInTheDocument();
  });

  test("the arrow keys move between photos", async () => {
    const { dialog } = open(0);

    await userEvent.keyboard("{ArrowRight}");
    expect(within(dialog).getByText("2 / 3")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}");
    expect(within(dialog).getByText("1 / 3")).toBeInTheDocument();
  });

  test("the close button closes it", async () => {
    const { dialog, onClose } = open(0);

    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });

  test("each slide is labelled for screen readers", () => {
    const { dialog } = open(0);

    const slides = within(dialog).getAllByRole("group");
    expect(slides).toHaveLength(3);
    expect(slides[2]).toHaveAttribute("aria-label", "Photo 3 of 3");
  });
});
