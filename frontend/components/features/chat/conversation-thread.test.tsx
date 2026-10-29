import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent, within } from "@/lib/test-utils";
import { chatMessage, fakeConnection, summary } from "@/lib/chat/test-connection";

const chat = vi.hoisted(() => ({ connectChat: vi.fn() }));
vi.mock("@/lib/chat/connection", () => chat);

import { ConversationThread } from "./conversation-thread";

const ME = "usr_me";

// A block body: a function returned from beforeEach is run as its teardown.
beforeEach(() => {
  chat.connectChat.mockReset();
});

const shown = () => within(screen.getByRole("list", { name: "Messages" })).getAllByRole("listitem").map((item) => item.textContent);

function setUp(overrides: Parameters<typeof fakeConnection>[0] = {}) {
  const fake = fakeConnection({
    listConversations: vi.fn(async () => [summary({ otherName: "Mara", listingTitle: "Lakeside loft" })]),
    getMessages: vi.fn(async () => [
      chatMessage({ id: "m1", senderId: "usr_mara", text: "Welcome!" }),
      chatMessage({ id: "m2", senderId: ME, text: "Thanks" }),
    ]),
    ...overrides,
  });
  chat.connectChat.mockResolvedValue(fake.connection);
  render(<ConversationThread conversationId="cv_1" me={ME} />);
  return fake;
}

describe("ConversationThread", () => {
  test("shows the history with the other person and marks it read", async () => {
    const { connection } = setUp();

    expect(await screen.findByText("Welcome!")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mara" })).toBeInTheDocument();
    expect(screen.getByText("Lakeside loft")).toBeInTheDocument();
    expect(shown()).toEqual(["Welcome!", "Thanks"]);
    expect(connection.markRead).toHaveBeenCalledWith("cv_1");
  });

  test("new messages in this conversation appear live, once, and other people's mark it read", async () => {
    const { connection, emit } = setUp();
    await screen.findByText("Welcome!");
    vi.mocked(connection.markRead).mockClear();

    emit.message(chatMessage({ id: "m3", senderId: "usr_mara", text: "Any questions?" }));
    emit.message(chatMessage({ id: "m3", senderId: "usr_mara", text: "Any questions?" }));
    emit.message(chatMessage({ id: "x1", conversationId: "cv_other", text: "Elsewhere" }));

    expect(await screen.findByText("Any questions?")).toBeInTheDocument();
    expect(shown()).toEqual(["Welcome!", "Thanks", "Any questions?"]);
    expect(connection.markRead).toHaveBeenCalledWith("cv_1");
  });

  test("Enter sends; Shift+Enter starts a new line", async () => {
    const { connection } = setUp();
    await screen.findByText("Welcome!");
    const box = screen.getByRole("textbox", { name: "Message" });

    await userEvent.type(box, "Is May free?{Shift>}{Enter}{/Shift}Two nights");
    expect(connection.send).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");

    expect(connection.send).toHaveBeenCalledWith("cv_1", "Is May free?\nTwo nights");
    expect(await screen.findByText(/Two nights/)).toBeInTheDocument();
    expect(box).toHaveValue("");
  });

  test("the composer waits for the connection, so Enter can't be lost", async () => {
    chat.connectChat.mockReturnValue(new Promise(() => {}));

    render(<ConversationThread conversationId="cv_1" me={ME} />);

    expect(screen.getByRole("textbox", { name: "Message" })).toBeDisabled();
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
  });

  test("announces incoming messages to screen readers", async () => {
    setUp();

    expect(await screen.findByRole("list", { name: "Messages" })).toHaveAttribute("aria-live", "polite");
  });

  test("a refused message shows the server's reason and keeps the draft", async () => {
    const { connection } = setUp({ send: vi.fn(async () => Promise.reject(new Error("You're sending messages too fast. Wait a moment."))) });
    await screen.findByText("Welcome!");

    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "Hi again{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("You're sending messages too fast");
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Hi again");
    expect(connection.send).toHaveBeenCalled();
  });

  test("a conversation you can't open says it wasn't found", async () => {
    setUp({ getMessages: vi.fn(async () => Promise.reject(new Error("Conversation not found"))) });

    expect(await screen.findByRole("alert")).toHaveTextContent("Conversation not found");
  });
});
