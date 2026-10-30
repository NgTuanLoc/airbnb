"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ConversationSummary } from "@/lib/chat/connection";
import { useChatConnection } from "./use-chat-connection";

const LOAD_ERROR = "Couldn't load your messages. Refresh the page to try again.";

/** The signed-in person's conversations, as guest and as host, newest first; kept current while it's open. */
export function InboxList() {
  const { connection, status, error } = useChatConnection();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!connection) return;
    let active = true;
    // Reloaded on every event rather than patched: the service works out the order and the unread counts.
    const load = () => {
      connection.listConversations().then(
        (list) => {
          if (active) setConversations(list);
        },
        () => {
          if (active) setLoadError(LOAD_ERROR);
        },
      );
    };
    load();
    const unsubscribe = [connection.onMessage(load), connection.onRead(load), connection.onReconnected(load)];
    return () => {
      active = false;
      unsubscribe.forEach((off) => off());
    };
  }, [connection]);

  const failure = error ?? loadError;
  if (failure) {
    return (
      <p role="alert" className="text-body-md text-error">
        {failure}
      </p>
    );
  }
  return (
    <>
      {status === "disconnected" && (
        <p role="alert" className="text-body-md text-error">
          Messages stopped updating. Refresh the page to reconnect.
        </p>
      )}
      <Conversations conversations={conversations} />
    </>
  );
}

function Conversations({ conversations }: Readonly<{ conversations: ConversationSummary[] | null }>) {
  if (!conversations) return <p className="text-body-md text-muted">Loading messages…</p>;
  if (conversations.length === 0) {
    return <p className="text-body-md text-body">No messages yet. Message a host from any listing page.</p>;
  }
  return (
    <ul aria-label="Conversations" className="flex flex-col divide-y divide-hairline">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <Link href={`/inbox/${conversation.id}`} className="flex items-start justify-between gap-4 rounded-sm py-4 hover:bg-surface-soft">
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-title-sm text-ink">{conversation.otherName}</span>
              <span className="text-body-sm text-muted">
                {conversation.listingTitle}
                {conversation.role === "host" && " · your listing"}
              </span>
              {conversation.lastMessageText && <span className="truncate text-body-sm text-body">{conversation.lastMessageText}</span>}
            </span>
            {conversation.unread > 0 && (
              <span className="shrink-0 rounded-full bg-rausch-text-bg px-3 py-1 text-caption text-on-primary">{conversation.unread} unread</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
