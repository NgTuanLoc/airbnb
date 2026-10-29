"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/design-system";
import type { ChatMessage, ConversationSummary } from "@/lib/chat/connection";
import { cn } from "@/lib/utils";
import { useChatConnection } from "./use-chat-connection";

const appendOnce = (current: ChatMessage[], message: ChatMessage): ChatMessage[] =>
  current.some((m) => m.id === message.id) ? current : [...current, message];

/** One conversation: its history, new messages as they arrive, and the composer. Opening it marks it read. */
export function ConversationThread({ conversationId, me }: { conversationId: string; me: string }) {
  const { connection, status, error } = useChatConnection();
  const connected = status === "connected";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The other person's latest live message: the only thing read aloud.
  const [lastIncoming, setLastIncoming] = useState<ChatMessage | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!connection) return;
    let active = true;
    const load = async () => {
      try {
        const [history, inbox] = await Promise.all([connection.getMessages(conversationId), connection.listConversations()]);
        if (!active) return;
        setMessages(history);
        setConversation(inbox.find((c) => c.id === conversationId) ?? null);
        await connection.markRead(conversationId);
      } catch (e) {
        if (active) setLoadError(e instanceof Error ? e.message : "Couldn't load this conversation");
      }
    };
    void load();
    const offMessage = connection.onMessage((message) => {
      if (message.conversationId !== conversationId) return;
      setMessages((current) => appendOnce(current, message));
      if (message.senderId === me) return;
      setLastIncoming(message);
      // Best effort: a receipt that fails just leaves the count for the next visit to clear.
      connection.markRead(conversationId).catch(() => undefined);
    });
    // Messages sent while the connection was down arrive with the reload.
    const offReconnected = connection.onReconnected(() => void load());
    return () => {
      active = false;
      offMessage();
      offReconnected();
    };
  }, [connection, conversationId, me]);

  async function send() {
    const text = draft.trim();
    if (!connection || !connected || !text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const message = await connection.send(conversationId, text);
      setMessages((current) => appendOnce(current, message));
      setDraft("");
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Couldn't send your message");
    } finally {
      setSending(false);
    }
  }

  const failure = error ?? loadError;
  if (failure) {
    return (
      <p role="alert" className="text-body-md text-error">
        {failure}
      </p>
    );
  }

  const otherName = conversation?.otherName ?? "Them";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 border-b border-hairline pb-4">
        <h1 className="text-display-sm text-ink">{conversation?.otherName ?? "Conversation"}</h1>
        {conversation && <p className="text-body-sm text-muted">{conversation.listingTitle}</p>}
      </header>
      {/* Who wrote each message is said, not just shown by side and colour (WCAG 1.3.1). */}
      <ol aria-label="Messages" className="flex flex-col gap-3">
        {messages.map((message) => {
          const mine = message.senderId === me;
          return (
            <li
              key={message.id}
              className={cn(
                "max-w-xl whitespace-pre-wrap rounded-md px-4 py-2 text-body-md",
                mine ? "self-end bg-ink text-on-primary" : "self-start bg-surface-soft text-ink",
              )}
            >
              <span className="sr-only">{mine ? "You" : otherName}: </span>
              <span>{message.text}</span>
            </li>
          );
        })}
      </ol>
      {/* Only the other person's new messages are read aloud: not the history, not your own. */}
      <div role="status" className="sr-only">
        {lastIncoming ? `${otherName}: ${lastIncoming.text}` : ""}
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label htmlFor="chat-draft" className="text-caption text-muted">
          Message
        </label>
        <textarea
          id="chat-draft"
          value={draft}
          rows={3}
          maxLength={2000}
          // Until the hub answers (and while it's gone), Enter would have nowhere to send.
          disabled={!connected}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter (or composing text) adds a line.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
          className="rounded-sm border border-hairline bg-canvas p-3 text-body-md text-ink placeholder:text-muted focus:border-2 focus:border-ink focus:outline-none"
        />
        {status === "connecting" && <p className="text-body-sm text-muted">Connecting…</p>}
        {status === "reconnecting" && <p className="text-body-sm text-muted">Reconnecting…</p>}
        {status === "disconnected" && (
          <p role="alert" className="text-body-sm text-error">
            Disconnected. Refresh the page to reconnect.
          </p>
        )}
        {sendError && (
          <p role="alert" className="text-body-sm text-error">
            {sendError}
          </p>
        )}
        <Button type="submit" disabled={!connected || sending || !draft.trim()} className="self-end">
          Send
        </Button>
      </form>
    </div>
  );
}
