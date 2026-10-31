import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent } from "@/lib/test-utils";
import { FakeEventSource, installFakeEventSource, stream } from "@/lib/notifications/test-event-source";
import { NotificationsProvider, useNotifications } from "./notifications-provider";

/** Shows what the provider gives the bell. */
function Probe() {
  const notifications = useNotifications();
  if (!notifications) return <p>Off</p>;
  return (
    <div>
      <p>Unread {notifications.unread}</p>
      <ul aria-label="Listed">
        {notifications.broadcasts.map((broadcast) => <li key={broadcast.id}>{broadcast.text}</li>)}
      </ul>
      <button type="button" onClick={() => notifications.setPanelOpen(!notifications.panelOpen)}>Toggle panel</button>
    </div>
  );
}

function renderLive() {
  return render(<NotificationsProvider enabled><Probe /></NotificationsProvider>);
}

const listed = () => screen.getAllByRole("listitem").map((item) => item.textContent);

beforeEach(() => {
  installFakeEventSource();
  localStorage.clear();
});

afterEach(() => vi.unstubAllGlobals());

describe("NotificationsProvider", () => {
  test("is off without the notification service: no stream, and no bell to fill", () => {
    render(<NotificationsProvider enabled={false}><Probe /></NotificationsProvider>);

    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(FakeEventSource.last).toBeNull();
  });

  test("listens on the stream route and stops when the page goes away", () => {
    const { unmount } = renderLive();

    expect(stream().url).toBe("/api/notifications/stream");
    unmount();
    expect(stream().closed).toBe(true);
  });

  test("lists what was sent before the page opened, newest first, without popping it up", () => {
    renderLive();

    stream().send("recent", { id: 1, text: "Pool closed on Monday" });
    stream().send("recent", { id: 2, text: "New check-in desk" });

    expect(listed()).toEqual(["New check-in desk", "Pool closed on Monday"]);
    expect(screen.getByText("Unread 2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss announcement" })).not.toBeInTheDocument();
  });

  test("counts as unread only what's newer than the last one read on this browser", () => {
    localStorage.setItem("notifications:last-read", "1");
    renderLive();

    stream().send("recent", { id: 1, text: "Read before" });
    stream().send("recent", { id: 2, text: "Not read yet" });

    expect(screen.getByText("Unread 1")).toBeInTheDocument();
  });

  test("news pops up and joins the list", () => {
    renderLive();
    stream().send("recent", { id: 1, text: "Earlier" });

    stream().send("broadcast", { id: 2, text: "Maintenance tonight at 10pm" });

    expect(screen.getByRole("button", { name: "Dismiss announcement" })).toBeInTheDocument();
    expect(listed()).toEqual(["Maintenance tonight at 10pm", "Earlier"]);
    expect(screen.getByText("Unread 2")).toBeInTheDocument();
  });

  test("an announcement sent again (a reconnect replays what it missed) is listed once", () => {
    renderLive();

    stream().send("recent", { id: 1, text: "Hello" });
    stream().send("broadcast", { id: 1, text: "Hello" });

    expect(listed()).toEqual(["Hello"]);
  });

  test("ignores events it can't read", () => {
    renderLive();

    stream().emit("broadcast", "not json");
    stream().emit("broadcast", JSON.stringify({ id: 3, text: "", sentAt: "2026-10-31T12:00:00Z" }));
    stream().emit("recent", JSON.stringify({ text: "No id", sentAt: "2026-10-31T12:00:00Z" }));
    stream().emit("broadcast", JSON.stringify({ id: 4, text: "No time" }));

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Dismiss announcement" })).not.toBeInTheDocument();
  });

  test("opening the panel reads everything, and this browser remembers it", async () => {
    renderLive();
    stream().send("recent", { id: 1, text: "First" });
    stream().send("broadcast", { id: 2, text: "Second" });

    await userEvent.click(screen.getByRole("button", { name: "Toggle panel" }));

    expect(screen.getByText("Unread 0")).toBeInTheDocument();
    expect(localStorage.getItem("notifications:last-read")).toBe("2");
    // The panel shows the news now, so its pop-up goes.
    expect(screen.queryByRole("button", { name: "Dismiss announcement" })).not.toBeInTheDocument();
  });

  test("news that arrives while the panel is open is announced, not popped up, and read once the panel closes", async () => {
    renderLive();
    await userEvent.click(screen.getByRole("button", { name: "Toggle panel" }));

    stream().send("broadcast", { id: 5, text: "Arrived while reading" });

    expect(screen.queryByRole("button", { name: "Dismiss announcement" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Announcement: Arrived while reading");
    await userEvent.click(screen.getByRole("button", { name: "Toggle panel" }));
    expect(screen.getByText("Unread 0")).toBeInTheDocument();
    expect(localStorage.getItem("notifications:last-read")).toBe("5");
  });

  test("keeps the newest 20, as the service does", () => {
    renderLive();

    for (let id = 1; id <= 21; id++) stream().send("recent", { id, text: `Announcement ${id}` });

    expect(listed()).toHaveLength(20);
    expect(listed().at(-1)).toBe("Announcement 2");
  });
});
