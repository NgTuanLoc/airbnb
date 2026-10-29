import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, userEvent, within } from "@/lib/test-utils";
import type { AskRequest, AssistantEvent } from "@/lib/assistant/schemas";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

const assistant = vi.hoisted(() => ({ askAssistant: vi.fn() }));
vi.mock("@/lib/assistant/client", () => assistant);

import { AssistantChatBox } from "./assistant-chat-box";

type Emit = (event: AssistantEvent) => void;

// Answers each question by playing these events, in order.
function answersWith(...events: AssistantEvent[]) {
  assistant.askAssistant.mockImplementationOnce(async (_request: AskRequest, emit: Emit) => events.forEach(emit));
}

beforeEach(() => {
  route.pathname = "/";
  assistant.askAssistant.mockReset();
});

async function openAndAsk(question: string) {
  await userEvent.click(screen.getByRole("button", { name: "Ask the assistant" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Your question" }), `${question}{Enter}`);
}

const turns = () => within(screen.getByRole("list", { name: "Conversation" })).getAllByRole("listitem").map((item) => item.textContent);

describe("AssistantChatBox", () => {
  test("opens on demand; Escape closes it and focus returns to the button", async () => {
    render(<AssistantChatBox />);
    const toggle = screen.getByRole("button", { name: "Ask the assistant" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.getByRole("dialog", { name: "Ask the assistant" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your question" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  test("on a listing page, questions carry that listing", async () => {
    route.pathname = "/rooms/l13";
    answersWith({ type: "text", text: "Yes, it has wifi." }, { type: "done" });
    render(<AssistantChatBox />);

    await openAndAsk("Does it have wifi?");

    expect(assistant.askAssistant).toHaveBeenCalledWith(
      { messages: [{ role: "user", text: "Does it have wifi?" }], listingId: "l13" },
      expect.any(Function),
      expect.anything(),
    );
  });

  test("shows the answer as it streams, then links to the places it found", async () => {
    answersWith(
      { type: "text", text: "Two cabins" },
      { type: "text", text: " fit." },
      { type: "listings", listings: [{ id: "l13", title: "Pine cabin", city: "Aspen", pricePerNight: 180, rating: 4.8 }] },
      { type: "done" },
    );
    render(<AssistantChatBox />);

    await openAndAsk("Cabins in Aspen?");

    expect(await screen.findByText("Two cabins fit.")).toBeInTheDocument();
    expect(turns()).toEqual([expect.stringContaining("You: Cabins in Aspen?"), expect.stringContaining("Assistant: Two cabins fit.")]);
    const place = screen.getByRole("link", { name: /Pine cabin/ });
    expect(place).toHaveAttribute("href", "/rooms/l13");
    expect(place).toHaveTextContent("Aspen");
    expect(place).toHaveTextContent("$180");
  });

  test("shows the model's Markdown as plain text", async () => {
    // Small models write Markdown even when told not to, and a mark can be split across the stream's pieces.
    answersWith({ type: "text", text: "### Two picks\nThe *" }, { type: "text", text: "*Pine cabin** is $180 a night." }, { type: "done" });
    render(<AssistantChatBox />);

    await openAndAsk("Cheapest cabin?");

    expect(await screen.findByText("Two picks The Pine cabin is $180 a night.")).toBeInTheDocument();
    expect(turns()[1]).toBe("Assistant: Two picks\nThe Pine cabin is $180 a night.");
    expect(screen.getByRole("status")).toHaveTextContent("Assistant: Two picks The Pine cabin is $180 a night.");
  });

  test("says it's thinking until the first words arrive", async () => {
    assistant.askAssistant.mockImplementationOnce(() => new Promise(() => {}));
    render(<AssistantChatBox />);

    await openAndAsk("Hello?");

    expect(screen.getByText("Thinking…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  test("follow-up questions carry the conversation so far", async () => {
    answersWith({ type: "text", text: "The Pine cabin is $180 a night." }, { type: "done" });
    answersWith({ type: "text", text: "Yes." }, { type: "done" });
    render(<AssistantChatBox />);

    await openAndAsk("Cheapest cabin?");
    await screen.findByText("The Pine cabin is $180 a night.");
    await userEvent.type(screen.getByRole("textbox", { name: "Your question" }), "Does it have a hot tub?{Enter}");

    expect(assistant.askAssistant).toHaveBeenLastCalledWith(
      {
        messages: [
          { role: "user", text: "Cheapest cabin?" },
          { role: "assistant", text: "The Pine cabin is $180 a night." },
          { role: "user", text: "Does it have a hot tub?" },
        ],
        listingId: null,
      },
      expect.any(Function),
      expect.anything(),
    );
  });

  test("shows a failure and lets the guest ask again", async () => {
    answersWith({ type: "text", text: "Let me" }, { type: "error", message: "The assistant couldn't answer just now. Try again in a moment." });
    assistant.askAssistant.mockImplementationOnce(async () => Promise.reject(new Error("You're asking quickly. Wait a minute and try again.")));
    render(<AssistantChatBox />);

    await openAndAsk("Hello?");
    expect(await screen.findByRole("alert")).toHaveTextContent("The assistant couldn't answer just now");
    await userEvent.type(screen.getByRole("textbox", { name: "Your question" }), "Hello again?{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("You're asking quickly");
    expect(screen.getByRole("textbox", { name: "Your question" })).toBeEnabled();
    // Failed answers aren't sent back as history.
    const second = assistant.askAssistant.mock.calls[1][0] as AskRequest;
    expect(second.messages).toEqual([{ role: "user", text: "Hello?" }, { role: "user", text: "Hello again?" }]);
  });
});
