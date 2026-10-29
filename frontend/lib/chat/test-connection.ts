import { vi } from "vitest";
import type { ChatConnection, ChatMessage, ConversationSummary } from "./connection";

type Handler<T> = (payload: T) => void;

/** A ChatConnection for component tests: every call is a mock, and `emit` plays the hub's events. */
export function fakeConnection(overrides: Partial<ChatConnection> = {}) {
  const handlers = {
    message: new Set<Handler<ChatMessage>>(),
    read: new Set<Handler<{ conversationId: string }>>(),
    reconnected: new Set<() => void>(),
  };
  const subscribe = <T>(set: Set<Handler<T>>) => (handler: Handler<T>) => {
    set.add(handler);
    return () => void set.delete(handler);
  };
  const connection = {
    listConversations: vi.fn(async (): Promise<ConversationSummary[]> => []),
    getMessages: vi.fn(async (): Promise<ChatMessage[]> => []),
    send: vi.fn(async (conversationId: string, text: string): Promise<ChatMessage> => ({
      id: `msg_${crypto.randomUUID()}`, conversationId, senderId: "me", text, sentAt: new Date().toISOString(),
    })),
    markRead: vi.fn(async () => {}),
    onMessage: vi.fn(subscribe(handlers.message)),
    onRead: vi.fn(subscribe(handlers.read)),
    onReconnected: vi.fn((handler: () => void) => {
      handlers.reconnected.add(handler);
      return () => void handlers.reconnected.delete(handler);
    }),
    stop: vi.fn(async () => {}),
    ...overrides,
  } satisfies ChatConnection;
  const emit = {
    message: (message: ChatMessage) => handlers.message.forEach((handler) => handler(message)),
    read: (conversationId: string) => handlers.read.forEach((handler) => handler({ conversationId })),
  };
  return { connection, emit };
}

export function summary(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "cv_1",
    listingId: "l13",
    listingTitle: "Lakeside loft",
    otherName: "Mara",
    role: "guest",
    lastMessageText: null,
    lastMessageAt: null,
    unread: 0,
    ...overrides,
  };
}

export function chatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `msg_${crypto.randomUUID()}`,
    conversationId: "cv_1",
    senderId: "usr_other",
    text: "Hello",
    sentAt: "2030-01-01T09:00:00Z",
    ...overrides,
  };
}
