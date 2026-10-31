import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, userEvent } from "@/lib/test-utils";
import type { Broadcast } from "@/lib/notifications/schemas";
import { BroadcastToast } from "./broadcast-toast";

const announcement: Broadcast = { id: 1, text: "Maintenance tonight at 10pm", sentAt: new Date("2026-10-31T12:00:00Z") };

function renderToast(broadcast: Broadcast | null = announcement, hidden = false) {
  const onDismiss = vi.fn();
  render(<BroadcastToast broadcast={broadcast} hidden={hidden} onDismiss={onDismiss} />);
  return onDismiss;
}

describe("BroadcastToast", () => {
  test("shows the announcement on a white card, and screen readers hear it", () => {
    renderToast();

    const text = screen.getByText("Maintenance tonight at 10pm");
    expect(screen.getByRole("status")).toHaveTextContent("Announcement: Maintenance tonight at 10pm");
    const card = text.closest(".toast");
    expect(card?.className).toContain("bg-canvas");
    expect(card?.className).toContain("shadow-airbnb");
    expect(card?.className).toContain("rounded-md");
  });

  test("dismisses with its button", async () => {
    const onDismiss = renderToast();

    await userEvent.click(screen.getByRole("button", { name: "Dismiss announcement" }));

    expect(onDismiss).toHaveBeenCalled();
  });

  test("dismisses with Escape", async () => {
    const onDismiss = renderToast();

    await userEvent.keyboard("{Escape}");

    expect(onDismiss).toHaveBeenCalled();
  });

  test("dismisses itself when its timer bar runs out", () => {
    const onDismiss = renderToast();

    fireEvent.animationEnd(document.querySelector(".toast-timer")!);

    expect(onDismiss).toHaveBeenCalled();
  });

  test("while the bell's panel shows it, only screen readers get it", () => {
    renderToast(announcement, true);

    expect(screen.queryByRole("button", { name: "Dismiss announcement" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Announcement: Maintenance tonight at 10pm");
  });

  test("with nothing to show, leaves only the empty status region", () => {
    renderToast(null);

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
