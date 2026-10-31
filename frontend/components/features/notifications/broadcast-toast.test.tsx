import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, userEvent } from "@/lib/test-utils";
import { BroadcastToast } from "./broadcast-toast";

/** The browser's EventSource, driven by hand: emit() delivers an event to the page's listeners. */
class FakeEventSource {
  static last: FakeEventSource | null = null;
  readonly url: string;
  closed = false;
  private readonly listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data: string) {
    act(() => this.listeners.get(type)?.forEach((listener) => listener(new MessageEvent(type, { data }))));
  }
}

const source = () => FakeEventSource.last!;

beforeEach(() => {
  FakeEventSource.last = null;
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => vi.unstubAllGlobals());

describe("BroadcastToast", () => {
  test("listens on the stream route and stops when it goes away", () => {
    const { unmount } = render(<BroadcastToast />);

    expect(source().url).toBe("/api/notifications/stream");
    unmount();
    expect(source().closed).toBe(true);
  });

  test("shows an announcement as it arrives, and screen readers hear it", () => {
    render(<BroadcastToast />);

    source().emit("broadcast", JSON.stringify({ id: 1, text: "Maintenance tonight at 10pm" }));

    expect(screen.getByText("Maintenance tonight at 10pm")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Announcement: Maintenance tonight at 10pm");
    // A dark toast: its dismiss button's focus ring is white.
    expect(screen.getByText("Maintenance tonight at 10pm").parentElement!.className).toContain("focus-ring-inverse");
  });

  test("a newer announcement replaces the one shown", () => {
    render(<BroadcastToast />);

    source().emit("broadcast", JSON.stringify({ id: 1, text: "First" }));
    source().emit("broadcast", JSON.stringify({ id: 2, text: "Second" }));

    expect(screen.queryByText("First")).not.toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  test("dismisses with its button or Escape, and shows the next one again", async () => {
    render(<BroadcastToast />);
    source().emit("broadcast", JSON.stringify({ id: 1, text: "First" }));

    await userEvent.click(screen.getByRole("button", { name: "Dismiss announcement" }));
    expect(screen.queryByText("First")).not.toBeInTheDocument();

    source().emit("broadcast", JSON.stringify({ id: 2, text: "Second" }));
    expect(screen.getByText("Second")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Second")).not.toBeInTheDocument();
  });

  test("ignores events it can't read", () => {
    render(<BroadcastToast />);

    source().emit("broadcast", "not json");
    source().emit("broadcast", JSON.stringify({ id: 3, text: "" }));
    source().emit("broadcast", JSON.stringify({ text: "No id" }));

    expect(screen.queryByRole("button", { name: "Dismiss announcement" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
