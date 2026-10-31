import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent, within } from "@/lib/test-utils";
import { installFakeEventSource, stream } from "@/lib/notifications/test-event-source";
import { NotificationBell } from "./notification-bell";
import { NotificationsProvider } from "./notifications-provider";

function renderBell() {
  return render(
    <NotificationsProvider enabled>
      <NotificationBell />
      <p>Elsewhere on the page</p>
    </NotificationsProvider>,
  );
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const bell = () => screen.getByRole("button", { name: /^Notifications/ });
const panel = () => screen.getByRole("region", { name: "Notifications" });

beforeEach(() => {
  installFakeEventSource();
  localStorage.clear();
});

afterEach(() => vi.unstubAllGlobals());

describe("NotificationBell", () => {
  test("isn't there when announcements are off", () => {
    const { container } = render(<NotificationBell />);

    expect(container).toBeEmptyDOMElement();
  });

  test("counts the unread announcements on a Rausch badge", () => {
    renderBell();

    stream().send("recent", { id: 1, text: "First" });
    stream().send("recent", { id: 2, text: "Second" });

    expect(bell()).toHaveAccessibleName("Notifications, 2 unread");
    const badge = within(bell()).getByText("2");
    expect(badge.className).toContain("bg-rausch-text-bg");
  });

  test("caps the badge at 9+, while the name keeps the count", () => {
    renderBell();

    for (let id = 1; id <= 12; id++) stream().send("recent", { id, text: `Announcement ${id}` });

    expect(bell()).toHaveAccessibleName("Notifications, 12 unread");
    expect(within(bell()).getByText("9+")).toBeInTheDocument();
  });

  test("has no badge once everything was read on this browser", () => {
    localStorage.setItem("notifications:last-read", "2");
    renderBell();

    stream().send("recent", { id: 1, text: "First" });
    stream().send("recent", { id: 2, text: "Second" });

    expect(bell()).toHaveAccessibleName("Notifications");
    expect(within(bell()).queryByText("2")).not.toBeInTheDocument();
  });

  test("opens a panel listing them newest first, with how long ago, the unread ones marked new", async () => {
    localStorage.setItem("notifications:last-read", "1");
    renderBell();
    stream().send("recent", { id: 1, text: "Pool closed on Monday", sentAt: minutesAgo(60 * 26) });
    stream().send("recent", { id: 2, text: "New check-in desk", sentAt: minutesAgo(5) });

    await userEvent.click(bell());

    expect(bell()).toHaveAttribute("aria-expanded", "true");
    const [newest, older] = within(panel()).getAllByRole("listitem");
    expect(newest).toHaveTextContent("New check-in desk");
    expect(newest).toHaveTextContent("5 minutes ago");
    expect(within(newest).getByText("New")).toBeInTheDocument();
    expect(older).toHaveTextContent("Pool closed on Monday");
    expect(older).toHaveTextContent("Yesterday");
    expect(within(older).queryByText("New")).not.toBeInTheDocument();
    // Opening it read them all.
    expect(bell()).toHaveAccessibleName("Notifications");
  });

  test("says so when there's nothing yet", async () => {
    renderBell();

    await userEvent.click(bell());

    expect(within(panel()).getByText("No notifications yet")).toBeInTheDocument();
  });

  test("closes with Escape, handing focus back to the bell, or a click outside", async () => {
    renderBell();
    await userEvent.click(bell());

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
    expect(bell()).toHaveFocus();

    await userEvent.click(bell());
    await userEvent.click(screen.getByText("Elsewhere on the page"));
    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
  });

  test("swings when news arrives, not for what was sent before the page opened", () => {
    renderBell();
    const icon = () => bell().querySelector("svg.lucide-bell");

    stream().send("recent", { id: 1, text: "Earlier" });
    expect(icon()?.getAttribute("class")).not.toContain("bell-ring");

    stream().send("broadcast", { id: 2, text: "Just sent" });
    expect(icon()?.getAttribute("class")).toContain("bell-ring");
  });
});
