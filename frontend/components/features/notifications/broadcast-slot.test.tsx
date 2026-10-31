import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

const config = vi.hoisted(() => ({ broadcastsEnabled: vi.fn(() => false) }));
vi.mock("@/lib/notifications/config", () => config);

import { BroadcastSlot } from "./broadcast-slot";

beforeEach(() => {
  config.broadcastsEnabled.mockReturnValue(false);
  vi.stubGlobal("EventSource", class {
    addEventListener() {}
    close() {}
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("BroadcastSlot", () => {
  test("listens for announcements when the notification service runs", () => {
    config.broadcastsEnabled.mockReturnValue(true);

    render(<BroadcastSlot />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  test("renders nothing in mock mode or without the service", () => {
    const { container } = render(<BroadcastSlot />);

    expect(container).toBeEmptyDOMElement();
  });
});
