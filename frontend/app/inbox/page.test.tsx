import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";

const session = vi.hoisted(() => ({ requireSession: vi.fn(), getSession: vi.fn(async () => null) }));
vi.mock("@/lib/auth/get-session", () => session);
const chatConfig = vi.hoisted(() => ({ chatEnabled: vi.fn(() => false) }));
vi.mock("@/lib/chat/config", () => chatConfig);
const chat = vi.hoisted(() => ({ connectChat: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/lib/chat/connection", () => chat);

import InboxPage from "./page";

beforeEach(() => {
  session.requireSession.mockResolvedValue({ id: "u-gus@example.com", name: "Gus", email: "gus@example.com" });
  chatConfig.chatEnabled.mockReturnValue(false);
});

describe("InboxPage", () => {
  test("is gated: it asks for a session to come back to", async () => {
    render(await InboxPage());

    expect(session.requireSession).toHaveBeenCalledWith("/inbox");
  });

  test("in mock mode it says messaging needs the backend", async () => {
    render(await InboxPage());

    expect(screen.getByText(/Messaging needs the backend/)).toBeInTheDocument();
    expect(chat.connectChat).not.toHaveBeenCalled();
  });

  test("with chat on it connects and lists conversations", async () => {
    chatConfig.chatEnabled.mockReturnValue(true);

    render(await InboxPage());

    expect(screen.getByRole("heading", { level: 1, name: "Messages" })).toBeInTheDocument();
    expect(chat.connectChat).toHaveBeenCalled();
  });
});
