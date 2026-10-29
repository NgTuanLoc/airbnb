import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen, within } from "@/lib/test-utils";
import { chatMessage, fakeConnection, summary } from "@/lib/chat/test-connection";

const chat = vi.hoisted(() => ({ connectChat: vi.fn() }));
vi.mock("@/lib/chat/connection", () => chat);

import { InboxList } from "./inbox-list";

// A block body: a function returned from beforeEach is run as its teardown.
beforeEach(() => {
  chat.connectChat.mockReset();
});

const titles = () => within(screen.getByRole("list", { name: "Conversations" })).getAllByRole("link").map((link) => link.textContent);

describe("InboxList", () => {
  test("lists each conversation with the other person, the listing, the last message and unread count", async () => {
    const { connection } = fakeConnection({
      listConversations: vi.fn(async () => [summary({ otherName: "Mara", lastMessageText: "See you in May", unread: 2 })]),
    });
    chat.connectChat.mockResolvedValue(connection);

    render(<InboxList />);

    const link = await screen.findByRole("link", { name: /Mara/ });
    expect(link).toHaveAttribute("href", "/inbox/cv_1");
    expect(link).toHaveTextContent("Lakeside loft");
    expect(link).toHaveTextContent("See you in May");
    expect(link).toHaveTextContent("2 unread");
  });

  test("a new message brings its conversation to the top", async () => {
    const first = [summary({ id: "cv_a", otherName: "Ana" }), summary({ id: "cv_b", otherName: "Ben" })];
    const after = [summary({ id: "cv_b", otherName: "Ben", lastMessageText: "Still free?" }), summary({ id: "cv_a", otherName: "Ana" })];
    const { connection, emit } = fakeConnection({ listConversations: vi.fn().mockResolvedValueOnce(first).mockResolvedValue(after) });
    chat.connectChat.mockResolvedValue(connection);
    render(<InboxList />);
    await screen.findByRole("link", { name: /Ana/ });

    emit.message(chatMessage({ conversationId: "cv_b", text: "Still free?" }));

    expect(await screen.findByText("Still free?")).toBeInTheDocument();
    expect(titles()[0]).toContain("Ben");
  });

  test("says when the list stops updating", async () => {
    const { connection, emit } = fakeConnection({ listConversations: vi.fn(async () => [summary()]) });
    chat.connectChat.mockResolvedValue(connection);
    render(<InboxList />);
    await screen.findByRole("link", { name: /Mara/ });

    act(() => emit.status("disconnected"));

    expect(screen.getByRole("alert")).toHaveTextContent("Messages stopped updating. Refresh the page to reconnect.");
    expect(screen.getByRole("link", { name: /Mara/ })).toBeInTheDocument();
  });

  test("an empty inbox says so", async () => {
    chat.connectChat.mockResolvedValue(fakeConnection().connection);

    render(<InboxList />);

    expect(await screen.findByText(/No messages yet/)).toBeInTheDocument();
  });

  test("a failed connection says so", async () => {
    chat.connectChat.mockRejectedValueOnce(new Error("offline"));

    render(<InboxList />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't connect to messages");
  });
});
