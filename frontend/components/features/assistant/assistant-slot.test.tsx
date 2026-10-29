import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

const config = vi.hoisted(() => ({ assistantEnabled: vi.fn(() => false) }));
vi.mock("@/lib/assistant/config", () => config);
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { AssistantSlot } from "./assistant-slot";

beforeEach(() => config.assistantEnabled.mockReturnValue(false));

describe("AssistantSlot", () => {
  test("shows the chat box when the assistant is on", () => {
    config.assistantEnabled.mockReturnValue(true);

    render(<AssistantSlot />);

    expect(screen.getByRole("button", { name: "Ask the assistant" })).toBeInTheDocument();
  });

  test("shows nothing in mock mode or without the assistant", () => {
    const { container } = render(<AssistantSlot />);

    expect(container).toBeEmptyDOMElement();
  });
});
